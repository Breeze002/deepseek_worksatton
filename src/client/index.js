/**
 * Client half of the session card board.
 *
 * Layout: `sidebar.panellist` holds the left-sidebar entry and the keyed `main` slot holds the
 * matching full-width panel — both use PANEL_ID, which is how a sidebar entry selects its
 * central panel. While a panel is active the Conversation yields to it; selecting any Session
 * (or `ctx.layout.selectPanel(null)`) switches back.
 *
 * Data: the board is a Host-owned snapshot stream. The panel registers immediately and works
 * without the Host half, so a Remote failure shows a message instead of removing the entry.
 * This half owns the Remote namespace: it mounts its own contribution (the same descriptors the
 * Host advertises) with `ctx.remote.$mount` before injecting `remote.sessionCards`.
 *
 * M2 scope: groups and members. Task dispatch and per-card execution state arrive in M3.
 */
import React from 'react';
import { remoteInfo } from '../../lib/rpc.js';

const h = React.createElement;


const zh = {
  createAndJoin: '创建并加入',
  creating: '创建中…',
  focusHint: 'Alt+数字 切成员 · Alt+G 群聊 · Alt+↑↓ 上/下一个 · Alt+0 回看板',
  focusOn: '群视图',
  newBlank: '新建空白会话',
  newSessionHint: '选一个工作区，并为新会话起个名字',
  newSessionTitle: '新建成员会话',
  noMembers: '还没有成员',
  noWorkspace: '没有可用工作区',
  pickWorkspace: '选择工作区',
  unnamed: '未命名',
  title: '会话卡片',
  create: '新建群组',
  empty: '还没有群组',
  emptyHint: '点右上角「新建群组」，选择已有会话作为成员。',
  waiting: '正在连接 Host 服务…',
  unavailable: 'Host 服务不可用',
  reconnect: '重试',
  addMember: '添加成员',
  archive: '归档',
  archiveNote: '归档后卡片从看板移走，成员会话本身不受影响。',
  remove: '移出',
  moveUp: '上移',
  moveDown: '下移',
  removeNote: '把该成员移出群组，不会影响它的会话。',
  openSession: '打开会话',
  cardNoTask: '未派活',
  idle: '空闲',
  statusRunning: '运行中',
  statusWaiting: '等你处理',
  statusDone: '已完成',
  statusUnread: '新',
  showSessions: '显示会话',
  groupChat: '群聊',
  groupChatHint: '群聊（普通会话界面，用 @成员 找人回答）',
  groupChatReady: '群聊已就绪 —— 输入 @成员名 提问，成员的回答会出现在这里。',
  send: '发送',
  nextMember: '下一个成员',
  members: '成员',
  groups: '群组',
  name: '群组名称',
  namePlaceholder: '例如：TPU 算子排查',
  goal: '目标（可选）',
  goalPlaceholder: '这个群要解决什么',
  pickSessions: '选择会话',
  pickHint: '至少选一个。别名是它在看板上显示的名字。',
  alias: '别名',
  aliasPlaceholder: '留空则用会话标题',
  selected: '已选',
  cancel: '取消',
  confirmCreate: '创建群组',
  confirmAdd: '加入群组',
  noSessions: '没有可选的会话',
  busy: '正在保存…',
  needName: '请填写群组名称',
  needMember: '请至少选择一个会话',
};
const en = {
  createAndJoin: 'Create and join',
  creating: 'Creating…',
  focusHint: 'Alt+digit switches member · Alt+G group chat · Alt+↑↓ step · Alt+0 back to the board',
  focusOn: 'Group view',
  newBlank: 'New blank session',
  newSessionHint: 'Pick a workspace and name the new session',
  newSessionTitle: 'New member session',
  noMembers: 'No members yet',
  noWorkspace: 'No workspace available',
  pickWorkspace: 'Pick a workspace',
  unnamed: 'Untitled',
  title: 'Session cards',
  create: 'New group',
  empty: 'No groups yet',
  emptyHint: 'Choose New group and pick existing sessions as members.',
  waiting: 'Connecting to the Host service…',
  unavailable: 'Host service unavailable',
  reconnect: 'Retry',
  addMember: 'Add member',
  archive: 'Archive',
  archiveNote: 'Archiving removes the cards from this board. Member sessions are unaffected.',
  remove: 'Remove',
  moveUp: 'Move up',
  moveDown: 'Move down',
  removeNote: 'Removes this member from the group; its session is unaffected.',
  openSession: 'Open session',
  cardNoTask: 'No task yet',
  idle: 'Idle',
  statusRunning: 'Running',
  statusWaiting: 'Needs you',
  statusDone: 'Done',
  statusUnread: 'new',
  showSessions: 'Sessions',
  groupChat: 'Group chat',
  groupChatHint: 'Group chat — a normal conversation; mention @name to ask someone',
  groupChatReady: 'Group chat ready — type @name to ask a member; their answer appears here.',
  send: 'Send',
  nextMember: 'Next member',
  members: 'Members',
  groups: 'Groups',
  name: 'Group name',
  namePlaceholder: 'For example: TPU kernel triage',
  goal: 'Goal (optional)',
  goalPlaceholder: 'What this group has to settle',
  pickSessions: 'Pick sessions',
  pickHint: 'Pick at least one. The alias is the name shown on the card.',
  alias: 'Alias',
  aliasPlaceholder: 'Defaults to the session title',
  selected: 'Selected',
  cancel: 'Cancel',
  confirmCreate: 'Create group',
  confirmAdd: 'Add to group',
  noSessions: 'No selectable sessions',
  busy: 'Saving…',
  needName: 'Enter a group name',
  needMember: 'Pick at least one session',
};


import { CARD_CSS } from './styles.js';
import { NS, PANEL_ID } from './constants.js';
import { Board } from './view/board.js';
import { SidebarEntry } from './view/entry.js';
import { ReadingAnchor, SessionRowAlias } from './view/status.js';
import { PanelBoundary, createPublisher, setReportDiagnostic } from './diagnostics.js';
import { Controller, currentSessionIdOf, describeFollow, followProbe, newCommandId, setController, getController, groupOfSession, latestBoardState, memberOfSession, setGroupChat, setSessionIndex, setFocus, setFocusCtx, setNavActions, pushSessionHistory, getCurrentShellSessionId, setCurrentShellSessionId, subscribeCurrentSession, runtimeListeners } from './state.js';
import { createKeyboardLayer } from './keyboard.js';
import { createReadingMemory } from './reading.js';
import { createGroupChat } from './chat.js';

export const inject = ['slots', 'locale', 'remote'];

export async function apply(ctx) {
  // The Client owns the namespace: mount this package's own contribution before using it.
  const release = await ctx.remote.$mount(remoteInfo);
  ctx.effect(() => release, 'session-cards: Remote methods');

  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'session-cards: dictionaries');
  ctx.effect(() => {
    const style = document.createElement('style');
    style.textContent = CARD_CSS;
    document.head.appendChild(style);
    return () => style.remove();
  }, 'session-cards: card styles');

  const t = ctx.locale.bind(NS);

  // Register the surfaces first: a Remote failure must not remove the sidebar entry.
  ctx.slots.inject('main', () =>
    ctx.slots.register(
      { name: 'main', key: PANEL_ID, locale: NS },
      (slotProps) => h(PanelBoundary, null, h(Board, { ctx, slotProps })),
    ),
  );
  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register(
      { name: 'sidebar.panellist', id: PANEL_ID, order: 11, locale: NS, label: () => t('title') },
      SidebarEntry,
    ),
  );

  // Readiness marker: an inert keyed contribution nobody dispatches, so it renders nothing while
  // Client inspection can still report what this half reached — including optional wiring errors.
  const publish = createPublisher(ctx);
  setReportDiagnostic(publish);

  try {
  setFocusCtx(ctx);

  // The shell's session nodes are the source for member status and for "which Session is shown".
  // Seeded here rather than inside an effect so the first render of any surface already has it.
  const sessionList = ctx.get('sessions')?.list;
  let lastSnapshot;
  const syncSessions = () => {
    const snapshot = sessionList?.getSnapshot();
    if (snapshot === lastSnapshot) return; // the store hands out a new object per change
    lastSnapshot = snapshot;
    const byId = snapshot?.byId ?? {};
    setSessionIndex(byId);
    setCurrentShellSessionId(currentSessionIdOf(byId));
  };
  try {
    syncSessions();
  } catch (failure) {
    publish(`sessionCardsSessionIndexError=${failure instanceof Error ? failure.message : String(failure)}`);
  }
  ctx.effect(() => {
    // The store's notification API is not part of any plugin contract, so a light poll keeps the
    // member status honest when subscribing is not available; a poll that finds the same snapshot
    // costs one reference comparison.
    const off = typeof sessionList?.subscribe === 'function' ? sessionList.subscribe(syncSessions) : undefined;
    const timer = typeof window.setInterval === 'function' ? window.setInterval(syncSessions, 1000) : undefined;
    return () => {
      off?.();
      if (timer !== undefined) window.clearInterval(timer);
    };
  }, 'session-cards: session index');

  // The group chat is an ordinary Session: route `@member` from it into that member's Session, and
  // mirror the member's answers back into it as lines.
  const chatEngine = createGroupChat({
    sessions: () => ctx.get('sessions'),
    controller: () => getController(),
    openSession: (sessionId) => ctx.get('uiWorkspace')?.openSession(sessionId),
    membersOf: (groupId) => (latestBoardState?.data?.groups ?? []).find((group) => group.id === groupId)?.members ?? [],
    seedLine: () => t('groupChatReady'),
    publish,
  });
  setGroupChat(chatEngine);
  // Routing follows the board: every live group's chat and members are watched once.
  const followChats = () => {
    for (const group of latestBoardState?.data?.groups ?? []) {
      if (group.archived === true) continue;
      void chatEngine.follow(group.id);
    }
  };
  runtimeListeners.add(followChats);
  ctx.effect(() => () => {
    runtimeListeners.delete(followChats);
    chatEngine.stop();
  }, 'session-cards: group chat');
  window.setTimeout(followChats, 0);

  // Remember where the reader was in each Session, and hold that place while an answer streams in.
  ctx.effect(
    () => createReadingMemory({ subscribeCurrentSession, currentSessionId: getCurrentShellSessionId, publish }),
    'session-cards: reading memory',
  );

  // Member status where the shell already is: a strip in every member conversation's header, and the
  // member alias on the shell's own session rows. The sidebar browsing region cannot be taken over
  // (it is a single "declaring is claiming" slot), so the status rides the rows instead.
  ctx.slots.inject('conversation.session.header.utilities', () =>
    ctx.slots.register(
      { name: 'conversation.session.header.utilities', id: 'session-cards-reading-anchor', order: 6, locale: NS },
      ReadingAnchor,
    ),
  );
  ctx.slots.inject('sidebar.session.row.trailing', () =>
    ctx.slots.register(
      { name: 'sidebar.session.row.trailing', id: 'session-cards-alias', order: 5, locale: NS },
      SessionRowAlias,
    ),
  );

  // Member keys follow the visible Session: inside a member's conversation Alt+1…9 and Alt+↑↓ work
  // without opening the board first. An explicit "back to board" stands them down until the user
  // switches Session again.
  let keysStoodDown = false;
  let followedSession;
  ctx.effect(() => {
    const sync = () => {
      const sessionId = getCurrentShellSessionId();
      if (sessionId !== followedSession) {
        followedSession = sessionId;
        keysStoodDown = false;
      }
      const owner = groupOfSession(latestBoardState, sessionId);
      const on = owner !== null && keysStoodDown !== true;
      followProbe.member = owner === null ? 'none' : (owner.member?.alias ?? 'chat');
      followProbe.taken = on ? 'keys-on' : 'keys-off';
      setFocus({ on });
      publish(`sessionCardsFollow=${describeFollow()}`);
    };
    runtimeListeners.add(sync);
    const unsubscribe = subscribeCurrentSession(sync);
    sync();
    return () => {
      unsubscribe();
      runtimeListeners.delete(sync);
    };
  }, 'session-cards: member keys follow the visible session');

  const openMember = (member) => {
    const current = getCurrentShellSessionId();
    if (current !== undefined && current !== member.sessionId) {
      pushSessionHistory(current);
    }
    setFocus({ memberId: member.id });
    const workspace = ctx.get('uiWorkspace');
    if (workspace === undefined || workspace === null) {
      publish(`sessionCardsNoWorkspace=${member.alias}`);
      return;
    }
    workspace.openSession(member.sessionId);
    publish(`sessionCardsOpened=${member.alias}`);
  };
  const enterFocusImpl = (options) => {
    keysStoodDown = false;
    setFocus({ on: true });
    // Show whatever the shell has selected; switching members is an explicit key or click so
    // entering the group view never jumps the conversation somewhere unexpected. `clearPanel` is
    // false when a switch follows immediately: clearing the panel in the same tick made the shell
    // re-apply the previous session and swallow the switch.
    if (options?.clearPanel !== false) ctx.get('layout')?.selectPanel(null);
  };
  const exitFocusImpl = () => {
    keysStoodDown = true;
    setFocus({ on: false });
    ctx.get('layout')?.selectPanel(PANEL_ID);
  };
  // The focus-mode actions are the only part of the wiring the keyboard layer and the views call
  // back into; they are installed here so nothing else has to know about ctx.
  setNavActions({ enterFocus: enterFocusImpl, exitFocus: exitFocusImpl, openMember });

  // The window keyboard layer: member switching, question cards, approvals and scrolling.
  createKeyboardLayer(ctx, { publish });

  } catch (failure) {
    publish(`sessionCardsWiringError=${(failure instanceof Error ? failure.message : String(failure)).slice(0, 90)}`);
  }

  await ctx.inject(['remote.sessionCards'], (activeCtx) => {
    const next = new Controller(activeCtx.remote.sessionCards);
    setController(next);
    void next.prime();
    return () => {
      next.dispose();
      if (getController() === next) setController(null);
    };
  });

  // The board is a client capability: another surface can open it from code, and its presence
  // reports that this half mounted its Remote namespace successfully.
  ctx.provide('sessionCards', {
    open: () => ctx.get('layout')?.selectPanel(PANEL_ID),
  });

  publish('sessionCardsReady');



}
