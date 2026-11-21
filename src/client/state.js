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
export const setCurrentShellSessionId = (sessionId) => {
  currentShellSessionId = sessionId;
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
