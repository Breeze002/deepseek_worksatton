/** Controller, its hooks, the focus store and the navigation actions. */
import React from 'react';

const h = React.createElement;

const EMPTY_STATE = { data: null, error: null, busy: false, groupId: null };

/**
 * Reads the board through the Host Remote namespace: one long-poll at a time, reconnecting
 * after a failure, and one queued mutation at a time so two clicks cannot interleave.
 */
class Controller {
  constructor(remote) {
    this.remote = remote;
    this.state = EMPTY_STATE;
    this.listeners = new Set();
    this.life = new AbortController();
    this.running = false;
    this.attached = 0;
  }

  getSnapshot = () => this.state;

  subscribe = (listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  update(patch) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  select = (groupId) => this.update({ groupId });

  reportError(error) {
    this.update({ error: error instanceof Error ? error.message : String(error) });
  }

  accept(data) {
    if (this.state.data && data.revision < this.state.data.revision) return;
    const usable = (id) => data.groups.some((group) => group.id === id && !group.archived);
    const groupId = this.state.groupId && usable(this.state.groupId)
      ? this.state.groupId
      : data.groups.find((group) => !group.archived)?.id ?? null;
    // Mirror for the keyboard: it must resolve members without any surface being mounted.
    latestBoardState = { data, groupId };
    this.update({ data, error: null, groupId });
  }

  async options() {
    const result = await this.remote.options({}, this.life.signal);
    if (!result.ok) throw result.error;
    return result.value;
  }

  async start() {
    if (this.running) return;
    this.running = true;
    try {
    while (!this.life.signal.aborted) {
      try {
        const result = this.state.data
          ? await this.remote.watch({ revision: this.state.data.revision }, this.life.signal)
          : await this.remote.snapshot({}, this.life.signal);
        if (!result.ok) throw result.error;
        this.accept(result.value);
      } catch (error) {
        if (this.life.signal.aborted) return;
        this.reportError(error);
        await new Promise((done) => {
          const timer = setTimeout(done, RECONNECT_MS);
          this.life.signal.addEventListener('abort', () => { clearTimeout(timer); done(); }, { once: true });
        });
      }
    }
    } finally {
      this.running = false;
    }
  }

  /** The Session hosting one group's chat (created on first use, Host side). */
  async chatSession(groupId) {
    const result = await this.remote.chatSession({ groupId }, this.life.signal);
    if (!result.ok) throw result.error;
    return result.value;
  }

  async execute(command) {
    if (this.state.busy) throw new Error('busy');
    this.update({ busy: true, error: null });
    try {
      const result = await this.remote.execute(command, this.life.signal);
      if (!result.ok) throw result.error;
      this.accept(result.value);
    } catch (error) {
      this.reportError(error);
      throw error;
    } finally {
      this.update({ busy: false });
    }
  }

  /** One snapshot at mount: the keyboard resolves members before any surface is opened. */
  async prime() {
    try {
      const result = await this.remote.snapshot({}, this.life.signal);
      if (result.ok) this.accept(result.value);
    } catch {
      /* the surfaces retry; a failed prime must not disturb activation */
    }
  }

  /** Each visible surface retains polling; the last release stops it. */
  attach() {
    this.attached += 1;
    if (this.attached !== 1) return;
    if (this.life.signal.aborted) this.life = new AbortController();
    void this.start();
  }

  detach() {
    this.attached = Math.max(0, this.attached - 1);
    if (this.attached === 0) this.life.abort();
  }

  dispose() {
    this.life.abort();
    this.listeners.clear();
  }
}

// The controller arrives asynchronously; the panel renders before it exists.
let controller = null;
const runtimeListeners = new Set();
const runtime = {
  subscribe: (listener) => {
    runtimeListeners.add(listener);
    return () => runtimeListeners.delete(listener);
  },
  getSnapshot: () => controller,
};

// Temporary M2 probe: the member picker's Remote outcome is republished into an inert keyed cell so
// Client inspection can read what the picker actually saw. Replaced by M3's real status surface.

function useController() {
  return React.useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
}

function useControllerState(active) {
  const subscribe = React.useCallback(
    (listener) => (active ? active.subscribe(listener) : () => {}),
    [active],
  );
  const getSnapshot = React.useCallback(
    () => (active ? active.getSnapshot() : EMPTY_STATE),
    [active],
  );
  return React.useSyncExternalStore(subscribe, getSnapshot);
}

function newCommandId() {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  return `cmd-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}


let focusCtx = null;
let focusState = { on: false, groupId: null, memberId: null };
const focusListeners = new Set();
const focusStore = {
  subscribe: (listener) => {
    focusListeners.add(listener);
    return () => focusListeners.delete(listener);
  },
  getSnapshot: () => focusState,
};
function setFocus(patch) {
  focusState = { ...focusState, ...patch };
  for (const listener of focusListeners) listener();
}
function useFocus() {
  return React.useSyncExternalStore(focusStore.subscribe, focusStore.getSnapshot);
}

/** Members of the group in view, resolved from the mirrored snapshot. */
function groupMembersOf(state) {
  const groups = (state.data?.groups ?? []).filter((group) => !group.archived);
  const group = groups.find((candidate) => candidate.id === state.groupId) ?? groups[0];
  return group?.members ?? [];
}
// Mirror of the latest board snapshot: the keyboard must resolve members even when no surface is
// mounted, so it reads this instead of a render-time variable.
let latestBoardState = { data: null, groupId: null };
// The Conversation the shell currently shows, plus the members we jumped from, so a keyboard
// "back" returns to the previous Conversation instead of guessing.
let currentShellSessionId;
const navHistory = [];

/** The member list that replaces the sidebar browsing region in focus mode. */

const EMPTY_SESSIONS = {};

/** What the "member keys follow the visible session" wiring observed, for one-shot diagnosis. */
export const followProbe = { props: 'no', current: 'none', member: 'none', taken: 'no' };
export const describeFollow = () => `props=${followProbe.props}:cur=${followProbe.current}:member=${followProbe.member}:taken=${followProbe.taken}`;

/**
 * The shell's session nodes, fed from `ctx.sessions.list` by apply(). A store of our own, because
 * the header and row seats hand us only a sessionId — their standardProps do not carry this data.
 */
let sessionIndexState = EMPTY_SESSIONS;
const sessionIndexListeners = new Set();
const sessionIndexStore = {
  subscribe: (listener) => {
    sessionIndexListeners.add(listener);
    return () => sessionIndexListeners.delete(listener);
  },
  getSnapshot: () => sessionIndexState,
};
export const useSessionIndex = () => React.useSyncExternalStore(sessionIndexStore.subscribe, sessionIndexStore.getSnapshot);
export const setSessionIndex = (byId) => {
  const next = byId === null || byId === undefined ? EMPTY_SESSIONS : byId;
  if (next === sessionIndexState) return; // a poll that finds nothing new must not churn the tree
  sessionIndexState = next;
  for (const listener of sessionIndexListeners) listener();
};

/** The Session the main view retains — the same rule the shell's own browser uses. */
export const currentSessionIdOf = (byId) => Object.values(byId ?? {}).find((session) => (session.retainedBy?.mainView ?? 0) > 0)?.id;

/** The keyboard layer reports a real scroll gesture here; the reading memory listens to it. */
let readingGesture = null;
export const setReadingGesture = (handler) => {
  readingGesture = handler;
};
export const noteReadingGesture = () => {
  readingGesture?.();
};

/** The chat engine, created by apply(): the view sends through it. */
let groupChat = null;
export const setGroupChat = (engine) => {
  groupChat = engine;
};
export const getGroupChat = () => groupChat;

/** The group a Session belongs to — as a member, or as the group's own chat Session. */
export function groupOfSession(boardState, sessionId) {
  if (sessionId === undefined || sessionId === null) return null;
  for (const group of boardState?.data?.groups ?? []) {
    if (group.archived === true) continue;
    if (group.chatSessionId !== undefined && group.chatSessionId !== null && group.chatSessionId === sessionId) {
      return { group, member: null };
    }
    const member = group.members.find((candidate) => candidate.sessionId === sessionId);
    if (member !== undefined) return { group, member };
  }
  return null;
}

/** The group member that owns a Session, if any: this is what makes the member list follow it. */
export function memberOfSession(boardState, sessionId) {
  if (sessionId === undefined || sessionId === null) return null;
  for (const group of boardState?.data?.groups ?? []) {
    if (group.archived === true) continue;
    const member = group.members.find((candidate) => candidate.sessionId === sessionId);
    if (member !== undefined) return { group, member };
  }
  return null;
}

/**
 * What a member is doing, from the same shell fields its own session list uses: a pending
 * interaction (approval / plan review / question), running, just finished, or idle.
 */
export function memberStatus(member, sessions) {
  const session = sessions?.[member.sessionId];
  if (session === null || session === undefined) return { kind: 'idle', key: 'idle' };
  if (session.pendingInteraction !== null && session.pendingInteraction !== undefined) {
    return { kind: 'waiting', key: 'statusWaiting' };
  }
  if (session.running === true || (session.runningSubagentCount ?? 0) > 0) {
    return { kind: 'running', key: 'statusRunning' };
  }
  if (session.completed === true) return { kind: 'done', key: 'statusDone' };
  return { kind: 'idle', key: 'idle' };
}

// "Finished while you were looking at someone else": a small subscribable set so the mark is
// reactive, and it clears as soon as that member is selected or opened.
let unreadState = {};
const unreadListeners = new Set();
const unreadStore = {
  subscribe: (listener) => {
    unreadListeners.add(listener);
    return () => unreadListeners.delete(listener);
  },
  getSnapshot: () => unreadState,
};
const publishUnread = (next) => {
  unreadState = next;
  for (const listener of unreadListeners) listener();
};
export const useUnread = () => React.useSyncExternalStore(unreadStore.subscribe, unreadStore.getSnapshot);
// A member whose current "done" state was already acknowledged must not be marked unread again by
// a later store update; leaving "done" (a new run) makes the next completion news again.
const seenDone = new Set();
export const markMemberSeen = (memberId) => {
  seenDone.add(memberId);
  if (unreadState[memberId] !== true) return;
  const next = { ...unreadState };
  delete next[memberId];
  publishUnread(next);
};
export const noteMemberStatus = (memberId, kind, viewing) => {
  if (kind !== 'done') {
    seenDone.delete(memberId);
    if (unreadState[memberId] === true) markMemberSeen(memberId);
    seenDone.delete(memberId);
    return;
  }
  if (viewing === true || seenDone.has(memberId)) {
    markMemberSeen(memberId);
    return;
  }
  if (unreadState[memberId] !== true) publishUnread({ ...unreadState, [memberId]: true });
};

// --- wiring: index.js installs the controller and the focus-mode navigation implementations ---
export const setController = (next) => {
  controller = next;
  for (const listener of runtimeListeners) listener();
};
export const getController = () => controller;
export const setFocusCtx = (ctx) => {
  focusCtx = ctx;
};
export const getCurrentShellSessionId = () => currentShellSessionId;
const sessionListeners = new Set();
export const subscribeCurrentSession = (listener) => {
  sessionListeners.add(listener);
  return () => sessionListeners.delete(listener);
};
export const setCurrentShellSessionId = (sessionId) => {
  if (currentShellSessionId === sessionId) return;
  currentShellSessionId = sessionId;
  for (const listener of sessionListeners) listener();
};
export const pushSessionHistory = (sessionId) => {
  navHistory.push(sessionId);
  if (navHistory.length > 24) navHistory.shift();
};
export const popSessionHistory = () => navHistory.pop();
let navActions = { enterFocus: () => {}, exitFocus: () => {}, openMember: () => {} };
export const setNavActions = (actions) => {
  navActions = actions;
};
export const enterFocus = (options) => navActions.enterFocus(options);
export const exitFocus = () => navActions.exitFocus();
export const openMember = (member) => navActions.openMember(member);
export const selectMember = (member) => navActions.openMember(member);

export function stepMember(delta) {
    const members = groupMembersOf(latestBoardState);
    if (members.length === 0) return;
    const found = members.findIndex((member) => member.id === focusState.memberId);
    const index = found < 0 ? (delta > 0 ? 0 : members.length - 1) : (found + delta + members.length) % members.length;
    const next = members[index];
    if (next === undefined) return;
    if (!focusState.on) {
      enterFocus({ clearPanel: false });
      window.setTimeout(() => openMember(next), 0);
      return;
    }
    openMember(next);
}

export {
  EMPTY_STATE, Controller, useController, useControllerState, newCommandId, runtimeListeners,
  focusState, focusCtx, setFocus, useFocus, groupMembersOf, latestBoardState,
};
