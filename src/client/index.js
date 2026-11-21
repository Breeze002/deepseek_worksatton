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
import { FocusList, SidebarEntry } from './view/focus-list.js';
import { PanelBoundary, createPublisher, setReportDiagnostic } from './diagnostics.js';
import { Controller, setController, getController, setFocus, setFocusCtx, setNavActions, pushSessionHistory, getCurrentShellSessionId } from './state.js';
import { createKeyboardLayer } from './keyboard.js';

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

  // Focus mode: while it is on, the member list owns the sidebar browsing region and the main
  // area shows the selected member's own Conversation. Unregistering restores the shipped
  // session browser, so "back to board" is a real exit rather than a second mode.
  // Readiness marker: an inert keyed contribution nobody dispatches, so it renders nothing while
  // Client inspection can still report what this half reached — including optional wiring errors.
  const publish = createPublisher(ctx);
  setReportDiagnostic(publish);

  try {
  setFocusCtx(ctx);
  let sidebarOccupant;
  const mountSidebarList = () => {
    try {
      sidebarOccupant ??= ctx.slots.register(
        { name: 'sidebar.workspaces' },
        (slotProps) => h(PanelBoundary, null, h(FocusList, slotProps)),
      );
    } catch (failure) {
      ctx.logger?.warn?.(`session-cards: sidebar takeover failed: ${failure instanceof Error ? failure.message : String(failure)}`);
    }
  };
  const unmountSidebarList = () => {
    if (sidebarOccupant === undefined) return;
    sidebarOccupant();
    sidebarOccupant = undefined;
  };
  ctx.effect(() => () => unmountSidebarList(), 'session-cards: sidebar takeover');

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
    mountSidebarList();
    setFocus({ on: true });
    // Show whatever the shell has selected; switching members is an explicit key or click so
    // entering the group view never jumps the conversation somewhere unexpected. `clearPanel` is
    // false when a switch follows immediately: clearing the panel in the same tick made the shell
    // re-apply the previous session and swallow the switch.
    if (options?.clearPanel !== false) ctx.get('layout')?.selectPanel(null);
  };
  const exitFocusImpl = () => {
    unmountSidebarList();
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
