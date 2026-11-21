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

const NS = 'session-cards';
const PANEL_ID = 'session-cards';
// Injected into <head>: the question-card cursor must be visible even when our panel is closed.
const CARD_CSS = '.dsc-card-ring{position:fixed;z-index:2147483000;pointer-events:none;display:none;'
  + 'border:2px solid var(--dsw-alias-state-business-primary,#2f6fed);border-radius:var(--dsw-radius-sm,6px);'
  + 'background:color-mix(in srgb,var(--dsw-alias-state-business-primary,#2f6fed) 16%,transparent)}'
  + '.dsc-card-cursor{outline:2px solid var(--dsw-alias-state-business-primary,#2f6fed) !important;'
  + 'outline-offset:2px !important;background-color:color-mix(in srgb,var(--dsw-alias-state-business-primary,#2f6fed) 16%,transparent) !important;'
  + 'border-radius:var(--dsw-radius-sm,6px) !important}';const RECONNECT_MS = 2_000;

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

const CSS = [
  // The stylesheet follows the shell's own conventions: `.5px` hairlines, `--dsw-radius-*`
  // corners, `--dsw-alias-interactive-bg-hover` for hover/selection, `--dsw-alias-label-caption`
  // for secondary text, and the business colour for the active member.
  '.dsc-root{display:flex;flex-direction:column;box-sizing:border-box;width:100%;height:100%;min-height:0;overflow:hidden;background:var(--dsw-alias-bg-base,Canvas);color:var(--dsw-alias-label-primary,CanvasText);font:inherit}',
  '.dsc-root *,.dsc-side *{box-sizing:border-box}',
  '.dsc-head{display:flex;flex:none;align-items:center;justify-content:space-between;gap:12px;padding:14px 18px 0}',
  '.dsc-head-title{display:flex;align-items:baseline;gap:8px;margin:0;font-size:14px;font-weight:600;letter-spacing:-.1px}',
  '.dsc-count{font-size:11px;font-weight:400;color:var(--dsw-alias-label-caption,GrayText)}',
  '.dsc-actions{display:flex;flex:none;align-items:center;gap:6px}',
  '.dsc-btn{display:inline-flex;align-items:center;justify-content:center;gap:5px;height:28px;padding:0 10px;border:.5px solid var(--dsw-alias-border-l4,rgba(127,127,127,.38));border-radius:var(--dsw-radius-md,8px);background:transparent;color:var(--dsw-alias-label-primary,CanvasText);font:inherit;font-size:12.5px;white-space:nowrap;cursor:pointer}',
  '.dsc-btn:hover:enabled{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12))}',
  '.dsc-btn:disabled{opacity:.45;cursor:default}',
  '.dsc-btn.is-primary{border-color:transparent;background:var(--dsw-alias-button-elevated-fill,rgba(127,127,127,.2))}',
  '.dsc-btn.is-danger:hover:enabled{color:var(--dsw-alias-state-error-primary,#c0392b)}',
  '.dsc-groups{display:flex;flex:none;flex-wrap:wrap;gap:4px;padding:10px 18px 0}',
  '.dsc-chip{height:24px;padding:0 9px;border:.5px solid transparent;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-secondary,GrayText);font:inherit;font-size:11.5px;white-space:nowrap;cursor:pointer}',
  '.dsc-chip:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12))}',
  '.dsc-chip.is-active{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14));color:var(--dsw-alias-label-primary,CanvasText);font-weight:500}',
  '.dsc-groupbar{display:flex;flex:none;flex-wrap:wrap;align-items:baseline;gap:10px;padding:12px 18px 0}',
  '.dsc-groupname{margin:0;font-size:13px;font-weight:600}',
  '.dsc-goal{margin:0;font-size:11.5px;color:var(--dsw-alias-label-caption,GrayText)}',
  '.dsc-body{flex:1;min-height:0;overflow:auto;padding:12px 18px 18px}',
  '.dsc-box .dsc-row-alias{font-size:12px}',
  '.dsc-box{border:.5px solid var(--dsw-alias-border-l3,rgba(127,127,127,.28));border-radius:var(--dsw-radius-lg,12px);background:var(--dsw-alias-bg-layer-1,transparent);padding:4px;max-width:360px}',
  '.dsc-members{display:flex;flex-direction:column;gap:1px}',
  '.dsc-row{position:relative;display:flex;align-items:center;gap:8px;height:34px;padding:0 4px 0 6px;border-radius:var(--dsw-radius-sm,6px)}',
  '.dsc-row:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12))}',
  '.dsc-row.is-active{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14))}',
  '.dsc-row.is-active .dsc-row-alias{color:var(--dsw-alias-state-business-primary,#2f6fed)}',
  '.dsc-row-main{display:flex;flex:1;min-width:0;align-items:center;gap:9px;height:100%;margin:0;padding:0;border:0;background:0 0;color:inherit;font:inherit;text-align:left;cursor:pointer}',
  '.dsc-row-main:focus-visible,.dsc-icon-btn:focus-visible,.dsc-btn:focus-visible{outline:var(--dsw-focus-cursorRing-width,2px) solid var(--dsw-focus-cursorRing-color,Highlight);outline-offset:1px}',
  '.dsc-avatar{flex:none;display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:var(--dsw-radius-sm,6px);background:var(--dsw-alias-button-elevated-fill,rgba(127,127,127,.2));color:var(--dsw-alias-label-secondary,GrayText);font-size:11px;font-weight:600;line-height:1}',
  '.dsc-row.is-active .dsc-avatar{color:var(--dsw-alias-state-business-primary,#2f6fed)}',
  '.dsc-row-text{display:flex;flex:1;min-width:0;flex-direction:column;gap:1px;line-height:1.25}',
  '.dsc-row-top{display:flex;align-items:center;gap:6px;min-width:0}',
  '.dsc-row-alias{font-size:12.5px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.dsc-row-key{flex:none;font-size:10px;color:var(--dsw-alias-label-caption,GrayText)}',
  '.dsc-row-sub{font-size:11px;color:var(--dsw-alias-label-caption,GrayText);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.dsc-dot{flex:none;width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-label-caption,GrayText)}',
  '.dsc-badge{display:inline-flex;align-items:center;flex:none}',
  '.dsc-row-actions{display:flex;flex:none;align-items:center;gap:2px;opacity:0;transition:opacity .12s ease}',
  '.dsc-row:hover .dsc-row-actions,.dsc-row.is-active .dsc-row-actions,.dsc-row:focus-within .dsc-row-actions{opacity:1}',
  '.dsc-icon-btn{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;margin:0;padding:0;border:0;border-radius:var(--dsw-radius-sm,6px);background:0 0;color:var(--dsw-alias-label-caption,GrayText);cursor:pointer}',
  '.dsc-icon-btn:hover:enabled{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14));color:var(--dsw-alias-label-primary,CanvasText)}',
  '.dsc-icon-btn:disabled{opacity:.4;cursor:default}',
  '.dsc-icon-btn.is-danger:hover:enabled{color:var(--dsw-alias-state-error-primary,#c0392b)}',
  '.dsc-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-height:180px;border:.5px dashed var(--dsw-alias-border-l3,rgba(127,127,127,.3));border-radius:var(--dsw-radius-lg,12px)}',
  '.dsc-empty-title{margin:0;font-size:12.5px;font-weight:500;color:var(--dsw-alias-label-secondary,GrayText)}',
  '.dsc-empty-hint{margin:0;font-size:11.5px;color:var(--dsw-alias-label-caption,GrayText)}',
  '.dsc-note{margin:0;font-size:11.5px;line-height:1.6;color:var(--dsw-alias-label-caption,GrayText)}',
  '.dsc-error{margin:0;font-size:11.5px;line-height:1.6;color:var(--dsw-alias-state-error-primary,#c0392b)}',
  '.dsc-overlay{position:fixed;inset:0;z-index:40;display:flex;align-items:center;justify-content:center;padding:24px;background:color-mix(in srgb,var(--dsw-alias-label-primary,CanvasText) 26%,transparent)}',
  '.dsc-modal{display:flex;flex-direction:column;gap:12px;width:min(520px,100%);max-height:100%;overflow:auto;padding:16px 18px;border:.5px solid var(--dsw-alias-border-l3,rgba(127,127,127,.28));border-radius:var(--dsw-radius-lg,12px);background:var(--dsw-alias-bg-layer-1,Canvas);color:var(--dsw-alias-label-primary,CanvasText);box-shadow:0 18px 48px color-mix(in srgb,var(--dsw-alias-label-primary,CanvasText) 22%,transparent)}',
  '.dsc-modal h3{margin:0;font-size:13.5px;font-weight:600}',
  '.dsc-field{display:flex;flex-direction:column;gap:5px}',
  '.dsc-field label{font-size:11.5px;color:var(--dsw-alias-label-caption,GrayText)}',
  '.dsc-input,.dsc-textarea{width:100%;padding:6px 9px;border:.5px solid var(--dsw-alias-border-l4,rgba(127,127,127,.38));border-radius:var(--dsw-radius-md,8px);background:transparent;color:inherit;font:inherit;font-size:12.5px}',
  '.dsc-textarea{min-height:52px;resize:vertical}',
  '.dsc-input:focus,.dsc-textarea:focus{outline:var(--dsw-focus-cursorRing-width,2px) solid var(--dsw-focus-cursorRing-color,Highlight);outline-offset:0}',
  '.dsc-picks{display:flex;flex-direction:column;max-height:260px;overflow:auto;margin:0;padding:0;border:.5px solid var(--dsw-alias-border-l3,rgba(127,127,127,.28));border-radius:var(--dsw-radius-md,8px)}',
  '.dsc-pick-group{display:flex;flex-direction:column}',
  '.dsc-pick-grouphead{position:sticky;top:0;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 9px 4px;font-size:10.5px;font-weight:600;color:var(--dsw-alias-label-caption,GrayText);background:var(--dsw-alias-bg-layer-1,Canvas)}',
  '.dsc-head-new{display:inline-flex;align-items:center;gap:3px;height:20px;padding:0 6px;border:0;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-caption,GrayText);font:inherit;font-size:10.5px;font-weight:500;cursor:pointer}',
  '.dsc-head-new:hover:enabled{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14));color:var(--dsw-alias-label-primary,CanvasText)}',
  '.dsc-head-new:disabled{opacity:.5;cursor:default}',
  '.dsc-pick-list{display:flex;flex-direction:column;gap:1px;margin:0;padding:0 4px 4px;list-style:none}',
  '.dsc-pick{display:flex;align-items:center;gap:9px;padding:5px 6px;border-radius:var(--dsw-radius-sm,6px)}',
  '.dsc-pick:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12))}',
  '.dsc-pick-text{display:flex;flex:1;min-width:0;flex-direction:column}',
  '.dsc-pick-title{font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.dsc-pick-path{font-size:11px;color:var(--dsw-alias-label-caption,GrayText);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.dsc-picks{outline:none}',
  '.dsc-picks .dsc-pick.is-cursor{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14));box-shadow:inset 2px 0 0 var(--dsw-alias-state-business-primary,#2f6fed)}',
  '.dsc-members{outline:none}',
  '.dsc-root{outline:none}',
  '.dsc-row:focus-within{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12))}',
  '.dsc-row:focus-within .dsc-row-actions{opacity:1}',
  '.dsc-pick input[type=text]{flex:none;width:110px;padding:4px 7px;border:.5px solid var(--dsw-alias-border-l4,rgba(127,127,127,.38));border-radius:var(--dsw-radius-sm,6px);background:transparent;color:inherit;font:inherit;font-size:11.5px}',
  '.dsc-foot{display:flex;justify-content:flex-end;gap:8px}',
  '.dsc-ws-list{display:flex;flex-direction:column;gap:2px;max-height:220px;overflow:auto;border:.5px solid var(--dsw-alias-border-l3,rgba(127,127,127,.28));border-radius:var(--dsw-radius-md,8px);padding:4px}',
  '.dsc-ws{display:flex;align-items:center;gap:8px;padding:5px 7px;border-radius:var(--dsw-radius-sm,6px);cursor:pointer}',
  '.dsc-ws:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12))}',
  '.dsc-ws.is-active{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14))}',
  '.dsc-ws-text{display:flex;flex-direction:column;min-width:0}',
  '.dsc-ws-title{font-size:12.5px}',
  '.dsc-ws-path{font-size:11px;color:var(--dsw-alias-label-caption,GrayText);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.dsc-side{display:flex;flex-direction:column;width:100%;height:100%;min-height:0;color:var(--dsw-alias-label-primary,CanvasText);font:inherit}',
  '.dsc-side-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 8px 6px}',
  '.dsc-side-title{font-size:11.5px;font-weight:600;letter-spacing:.02em;text-transform:uppercase;color:var(--dsw-alias-label-caption,GrayText);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.dsc-side-groups{display:flex;flex-wrap:wrap;gap:4px;padding:0 8px 6px}',
  '.dsc-side-body{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:1px;padding:0 6px}',
  '.dsc-side .dsc-row:hover,.dsc-side .dsc-row.is-active{background:var(--dsw-specific-sidebar-glass-hover,var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14)))}',
  '.dsc-side-hint{margin:auto 0 0;padding:8px 10px 0;font-size:10.5px;line-height:1.5;color:var(--dsw-alias-label-caption,GrayText)}',
].join('\n');

/**
 * One column of member cards: a prominent card plus two queued cards, which keeps the
 * silhouette distinct from the neighbouring 2x2 workbench glyph. Inherits the sidebar's
 * text colour through `currentColor`.
 */
function Glyph({ size = 18, active = false }) {
  const card = active ? 0.34 : 0.24;
  return h(
    'svg',
    { width: size, height: size, viewBox: '0 0 36 36', 'aria-hidden': true, style: { display: 'block' } },
    h('rect', { x: 6, y: 8, width: 14, height: 20, rx: 3, fill: 'currentColor', opacity: card }),
    h('circle', { cx: 10.6, cy: 12.4, r: 1.7, fill: 'currentColor', opacity: active ? 1 : 0.85 }),
    h('rect', { x: 9, y: 17, width: 8, height: 2, rx: 1, fill: 'currentColor', opacity: 0.55 }),
    h('rect', { x: 9, y: 21, width: 5.5, height: 2, rx: 1, fill: 'currentColor', opacity: 0.4 }),
    h('rect', { x: 22, y: 8, width: 8, height: 9, rx: 2.5, fill: 'currentColor', opacity: card }),
    h('rect', { x: 22, y: 19, width: 8, height: 9, rx: 2.5, fill: 'currentColor', opacity: card }),
  );
}

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
let reportDiagnostic = () => {};

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

function Btn({ primary, danger, ...rest }) {
  const className = ['dsc-btn', primary ? 'is-primary' : '', danger ? 'is-danger' : ''].filter(Boolean).join(' ');
  return h('button', { type: 'button', className, ...rest });
}

function Modal({ title, onClose, onSubmit, submitLabel, busy, error, disabled, children }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    // Only text entry claims focus; a checkbox would take the list's arrow keys away.
    const first = ref.current?.querySelector('input:not([type="checkbox"]):not([type="radio"]), textarea, select');
    first?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return h(
    'div',
    {
      className: 'dsc-overlay',
      role: 'presentation',
      onMouseDown: (event) => {
        if (event.target === event.currentTarget) onClose();
      },
    },
    h(
      'form',
      {
        ref,
        className: 'dsc-modal',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': title,
        onSubmit: (event) => {
          event.preventDefault();
          onSubmit();
        },
      },
      h('h3', null, title),
      children,
      error ? h('p', { className: 'dsc-error', role: 'alert' }, error) : null,
      h(
        'div',
        { className: 'dsc-foot' },
        h(Btn, { onClick: onClose, disabled: busy }, submitLabel.cancel),
        h(Btn, { type: 'submit', primary: true, disabled: busy || disabled }, busy ? submitLabel.busy : submitLabel.submit),
      ),
    ),
  );
}

/** Session picker shared by the create and add flows. `picked` maps sessionId to an alias. */
/** Session picker shared by the create and add flows, grouped by owning Workspace. */
function SessionPicker({ t, groups, exclude, picked, onToggle, onAlias, onCreate, creating, loading }) {
  const [cursor, setCursor] = React.useState(0);
  const container = React.useRef(null);
  // Every hook runs before the early returns: the visible rows are therefore computed up front.
  const visible = loading
    ? []
    : groups
        .map((group) => ({ ...group, sessions: group.sessions.filter((session) => !exclude?.has(session.sessionId)) }))
        .filter((group) => group.sessions.length > 0);
  const flat = visible.flatMap((group) => group.sessions);
  const index = Math.min(cursor, Math.max(0, flat.length - 1));
  React.useEffect(() => {
    container.current?.focus?.();
  }, []);
  React.useEffect(() => {
    container.current?.querySelector('.dsc-pick.is-cursor')?.scrollIntoView({ block: 'nearest' });
  }, [index]);
  React.useEffect(() => {
    const active = container.current?.querySelector('.dsc-pick.is-cursor');
    active?.scrollIntoView({ block: 'nearest' });
  }, [index]);
  if (loading) return h('p', { className: 'dsc-note' }, t('waiting'));
  if (!visible.length) return h('p', { className: 'dsc-note' }, t('noSessions'));
  const onKeyDown = (event) => {
    if (event.target instanceof HTMLInputElement && event.target.type !== 'checkbox') return;
    if (event.target instanceof HTMLInputElement && event.target.type === 'checkbox' && event.key === ' ') return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setCursor((current) => (flat.length === 0 ? 0 : (current + (event.key === 'ArrowDown' ? 1 : -1) + flat.length) % flat.length));
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      setCursor(event.key === 'Home' ? 0 : Math.max(0, flat.length - 1));
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      const session = flat[index];
      if (session === undefined) return;
      event.preventDefault();
      onToggle(session.sessionId);
    }
  };
  return h(
    'div',
    { className: 'dsc-picks', tabIndex: 0, ref: container, onKeyDown },
    visible.map((group) =>
      h(
        'section',
        { className: 'dsc-pick-group', key: group.id },
        h(
          'div',
          { className: 'dsc-pick-grouphead' },
          h('span', null, `${group.title} · ${group.sessions.length}`),
          onCreate && !group.id.startsWith('cwd:')
            ? h(
                'button',
                { type: 'button', className: 'dsc-head-new', disabled: creating, onClick: () => onCreate(group) },
                h(Icon, { name: 'plus', size: 12 }),
                creating ? t('creating') : t('newBlank'),
              )
            : null,
        ),
        h(
          'ul',
          { className: 'dsc-pick-list' },
          group.sessions.map((session) =>
            h(
              'li',
              {
                className: `dsc-pick${flat[index]?.sessionId === session.sessionId ? ' is-cursor' : ''}`,
                key: session.sessionId,
                onClick: () => setCursor(flat.findIndex((candidate) => candidate.sessionId === session.sessionId)),
              },
              h('input', {
                type: 'checkbox',
                checked: Object.prototype.hasOwnProperty.call(picked, session.sessionId),
                onChange: () => onToggle(session.sessionId),
                'aria-label': session.title,
              }),
              h(
                'span',
                { className: 'dsc-pick-text' },
                h('span', { className: 'dsc-pick-title' }, session.title),
                session.cwd ? h('span', { className: 'dsc-pick-path' }, session.cwd) : null,
              ),
              Object.prototype.hasOwnProperty.call(picked, session.sessionId)
                ? h('input', {
                    type: 'text',
                    value: picked[session.sessionId] ?? '',
                    maxLength: 32,
                    placeholder: t('aliasPlaceholder'),
                    onChange: (event) => onAlias(session.sessionId, event.target.value),
                  })
                : null,
            ),
          ),
        ),
      ),
    ),
  );
}

/** Read one candidate's title out of the grouped picker data. */
function sessionTitleFrom(groups, sessionId) {
  for (const group of groups) {
    const hit = group.sessions.find((session) => session.sessionId === sessionId);
    if (hit) return hit.title;
  }
  return sessionId;
}

/** Reveal an element by scrolling its nearest scroll container — never the page around it. */
function revealInScroller(element) {
  let node = element.parentElement;
  while (node instanceof HTMLElement) {
    const overflowY = window.getComputedStyle(node).overflowY;
    const scrollable = (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay')
      && node.scrollHeight > node.clientHeight + 1;
    if (scrollable) {
      const target = element.getBoundingClientRect();
      const box = node.getBoundingClientRect();
      if (target.top < box.top) node.scrollTop -= box.top - target.top + 8;
      else if (target.bottom > box.bottom) node.scrollTop += target.bottom - box.bottom + 8;
      return;
    }
    node = node.parentElement;
  }
}

/** 16px line icons drawn like the shell's own controls (stroke, currentColor). */
function Icon({ name, size = 16 }) {
  const paths = {
    open: 'M6 3.5 11 8l-5 4.5',
    remove: 'M4 4l8 8M12 4l-8 8',
    back: 'M10 3.5 5.5 8l4.5 4.5',
    plus: 'M8 3.5v9M3.5 8h9',
    users: 'M6 7.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4ZM2 13.2c0-1.8 1.8-2.9 4-2.9s4 1.1 4 2.9M11 6.4a1.8 1.8 0 1 0 0-3.6M12 13.2c0-1.4-.7-2.4-2-2.8',
    up: 'M8 12.5V3.5M4.5 7 8 3.5 11.5 7',
    down: 'M8 3.5v9M4.5 9 8 12.5 11.5 9',
  };
  return h(
    'svg',
    {
      width: size,
      height: size,
      viewBox: '0 0 16 16',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.4,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': true,
      style: { display: 'block' },
    },
    h('path', { d: paths[name] ?? paths.open }),
  );
}

/** One member row, shared by the board list and the sidebar focus list. */
function MemberRow({ t, member, busy, active, hint, onSelect, onOpen, onRemove, onMove, canUp, canDown }) {
  const moveKeyDown = (event) => {
    if (onMove === undefined || event.ctrlKey !== true) return;
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    onMove(member, event.key === 'ArrowUp' ? -1 : 1);
  };
  const initial = (member.alias ?? '?').trim().slice(0, 1).toUpperCase();
  return h(
    'div',
    { className: `dsc-row${active ? ' is-active' : ''}` },
    h(
      'button',
      {
        type: 'button',
        className: 'dsc-row-main',
        onClick: () => onSelect(member),
        onKeyDown: moveKeyDown,
        title: member.title,
      },
      h('span', { className: 'dsc-avatar', 'aria-hidden': true }, initial),
      h(
        'span',
        { className: 'dsc-row-text' },
        h(
          'span',
          { className: 'dsc-row-top' },
          h('span', { className: 'dsc-row-alias' }, member.alias),
          hint ? h('span', { className: 'dsc-row-key' }, hint) : null,
        ),
        h('span', { className: 'dsc-row-sub' }, member.title || t('unnamed')),
      ),
    ),
    h('span', { className: 'dsc-badge', title: t('idle') }, h('span', { className: 'dsc-dot' })),
    h(
      'span',
      { className: 'dsc-row-actions' },
      onMove
        ? h(
            'button',
            { type: 'button', className: 'dsc-icon-btn', title: t('moveUp'), disabled: busy || canUp === false, onClick: () => onMove(member, -1) },
            h(Icon, { name: 'up', size: 13 }),
          )
        : null,
      onMove
        ? h(
            'button',
            { type: 'button', className: 'dsc-icon-btn', title: t('moveDown'), disabled: busy || canDown === false, onClick: () => onMove(member, 1) },
            h(Icon, { name: 'down', size: 13 }),
          )
        : null,
      onOpen
        ? h(
            'button',
            { type: 'button', className: 'dsc-icon-btn', title: t('openSession'), disabled: busy, onClick: () => onOpen(member) },
            h(Icon, { name: 'open' }),
          )
        : null,
      onRemove
        ? h(
            'button',
            { type: 'button', className: 'dsc-icon-btn is-danger', title: t('remove'), disabled: busy, onClick: () => onRemove(member) },
            h(Icon, { name: 'remove' }),
          )
        : null,
    ),
  );
}

function CreateGroupForm({ t, controller, groups, loading, onDone, onCancel, controllerError, onCreateSession, creating }) {
  const [name, setName] = React.useState('');
  const [goal, setGoal] = React.useState('');
  const [picked, setPicked] = React.useState({});
  const [error, setError] = React.useState(null);
  const [busy, setBusy] = React.useState(false);

  const toggle = (sessionId) =>
    setPicked((current) => {
      const next = { ...current };
      if (Object.prototype.hasOwnProperty.call(next, sessionId)) delete next[sessionId];
      else next[sessionId] = '';
      return next;
    });

  const submit = async () => {
    const chosen = Object.entries(picked);
    if (!name.trim()) return setError(t('needName'));
    if (!chosen.length) return setError(t('needMember'));
    setError(null);
    setBusy(true);
    try {
      await controller.execute({
        commandId: newCommandId(),
        action: 'createGroup',
        name: name.trim(),
        goal: goal.trim(),
        members: chosen.map(([sessionId, alias]) => ({
          sessionId,
          alias: alias.trim() || sessionTitleFrom(groups, sessionId).slice(0, 32),
        })),
      });
      onDone();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };

  return h(
    Modal,
    {
      title: t('create'),
      onClose: onCancel,
      onSubmit: submit,
      submitLabel: { cancel: t('cancel'), submit: t('confirmCreate'), busy: t('busy') },
      busy,
      error: error ?? controllerError,
      disabled: loading,
    },
    h(
      'div',
      { className: 'dsc-field' },
      h('label', { htmlFor: 'dsc-name' }, t('name')),
      h('input', {
        id: 'dsc-name',
        className: 'dsc-input',
        value: name,
        maxLength: 80,
        placeholder: t('namePlaceholder'),
        onChange: (event) => setName(event.target.value),
      }),
    ),
    h(
      'div',
      { className: 'dsc-field' },
      h('label', { htmlFor: 'dsc-goal' }, t('goal')),
      h('textarea', {
        id: 'dsc-goal',
        className: 'dsc-textarea',
        value: goal,
        maxLength: 4000,
        rows: 2,
        placeholder: t('goalPlaceholder'),
        onChange: (event) => setGoal(event.target.value),
      }),
    ),
    h('p', { className: 'dsc-note' }, t('pickHint')),
    h(SessionPicker, {
      t,
      groups,
      picked,
      onToggle: toggle,
      onAlias: (sessionId, alias) => setPicked((current) => ({ ...current, [sessionId]: alias })),
      onCreate: async (group) => {
        const sessionId = await onCreateSession(group);
        if (sessionId !== undefined) setPicked((current) => ({ ...current, [sessionId]: '' }));
      },
      creating,
      loading,
    }),
  );
}

function AddMemberForm({ t, controller, group, existing, groups, loading, onDone, onCancel, controllerError, onCreateSession, creating }) {
  const [picked, setPicked] = React.useState({});
  const [error, setError] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const exclude = new Set(existing);

  const submit = async () => {
    const chosen = Object.entries(picked);
    if (!chosen.length) return setError(t('needMember'));
    setError(null);
    setBusy(true);
    try {
      for (const [sessionId, alias] of chosen) {
        await controller.execute({
          commandId: newCommandId(),
          action: 'addMember',
          groupId: group.id,
          member: {
            sessionId,
            alias: alias.trim() || sessionTitleFrom(groups, sessionId).slice(0, 32),
          },
        });
      }
      onDone();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };

  return h(
    Modal,
    {
      title: t('addMember'),
      onClose: onCancel,
      onSubmit: submit,
      submitLabel: { cancel: t('cancel'), submit: t('confirmAdd'), busy: t('busy') },
      busy,
      error: error ?? controllerError,
      disabled: loading,
    },
    h('p', { className: 'dsc-note' }, `${t('groups')}: ${group.name}`),
    h(SessionPicker, {
      t,
      groups,
      exclude,
      onCreate: async (workspaceGroup) => {
        const sessionId = await onCreateSession(workspaceGroup);
        if (sessionId === undefined) return;
        try {
          await controller.execute({
            commandId: newCommandId(),
            action: 'addMember',
            groupId: group.id,
            member: { sessionId, alias: t('unnamed').slice(0, 32) },
          });
          onDone();
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : String(failure));
        }
      },
      creating,
      picked,
      onToggle: (sessionId) =>
        setPicked((current) => {
          const next = { ...current };
          if (Object.prototype.hasOwnProperty.call(next, sessionId)) delete next[sessionId];
          else next[sessionId] = '';
          return next;
        }),
      onAlias: (sessionId, alias) => setPicked((current) => ({ ...current, [sessionId]: alias })),
      loading,
    }),
  );
}

// Focus mode: the member list owns the sidebar browsing region while it is on, and the main area
// shows the selected member's own Conversation. `focusCtx` is set by apply().
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
let enterFocus = () => {};
let exitFocus = () => {};
let selectMember = () => {};

/** The member list that replaces the sidebar browsing region in focus mode. */
function FocusList(props) {
  const ctx = focusCtx;
  // The host's own selector for "the session the main view retains". Captured once for the same
  // reason as the workspace hook above: a slot hook must never be called conditionally.
  const sessionsHook = React.useRef(props?.useSessions);
  const readSessions = sessionsHook.current ?? ((selector) => selector({ byId: {} }));
  currentShellSessionId = readSessions(
    (state) => Object.values(state.byId).find((session) => session.retainedBy?.mainView > 0)?.id,
  );
  const active = useController();
  const state = useControllerState(active);
  const focus = useFocus();
  const t = ctx.locale.bind(NS);
  React.useSyncExternalStore((listener) => ctx.locale.subscribe(listener), () => t('title'));

  React.useEffect(() => {
    if (!active) return undefined;
    active.attach();
    return () => active.detach();
  }, [active]);

  /** Reordering persists because it decides the Alt+1…9 mapping. */
  const moveMember = async (member, delta) => {
    if (!active || !group) return;
    const index = group.members.findIndex((candidate) => candidate.id === member.id);
    if (index < 0) return;
    try {
      await active.execute({
        commandId: newCommandId(),
        action: 'moveMember',
        groupId: group.id,
        memberId: member.id,
        toIndex: index + delta,
      });
    } catch (failure) {
      active.reportError(failure);
    }
  };

  const groups = (state.data?.groups ?? []).filter((group) => !group.archived);
  const group = groups.find((candidate) => candidate.id === state.groupId) ?? groups[0] ?? null;

  return h(
    'div',
    { className: 'dsc-side' },
    h('style', null, CSS),
    h(
      'div',
      { className: 'dsc-side-head' },
      h('span', { className: 'dsc-side-title', title: group?.name ?? t('title') }, group?.name ?? t('title')),
      h(
        'button',
        { type: 'button', className: 'dsc-btn', style: { height: '24px', fontSize: '11.5px' }, onClick: () => exitFocus() },
        h(Icon, { name: 'back', size: 13 }),
        t('backToBoard'),
      ),
    ),
    groups.length > 1
      ? h(
          'div',
          { className: 'dsc-side-groups' },
          groups.map((candidate) =>
            h(
              'button',
              {
                key: candidate.id,
                type: 'button',
                className: `dsc-chip${candidate.id === group?.id ? ' is-active' : ''}`,
                onClick: () => active?.select(candidate.id),
              },
              candidate.name,
            ),
          ),
        )
      : null,
    h(
      'div',
      { className: 'dsc-side-body' },
      !group || group.members.length === 0
        ? h('p', { className: 'dsc-note', style: { padding: '10px 6px' } }, t('noMembers'))
        : group.members.map((member, index) =>
            h(MemberRow, {
              key: member.id,
              t,
              member,
              active: member.sessionId === (currentShellSessionId ?? undefined) || member.id === focus.memberId,
              busy: false,
              hint: index < 9 ? `Alt+${index + 1}` : undefined,
              onSelect: (target) => selectMember(target),
              onMove: (target, delta) => moveMember(target, delta),
              canUp: index > 0,
              canDown: index < group.members.length - 1,
            }),
          ),
    ),
    h('p', { className: 'dsc-side-hint' }, t('focusHint')),
    h('p', { className: 'dsc-side-hint', style: { marginTop: '2px', paddingTop: '0' } }, t('keysHint')),
  );
}

/** Workspace chooser for a brand-new member session: the user picks where it lives. */
function NewSessionForm({ t, workspaces, busy, controllerError, onCancel, onSubmit }) {
  const [workspaceId, setWorkspaceId] = React.useState(workspaces[0]?.workspaceId ?? workspaces[0]?.id ?? '');
  const [alias, setAlias] = React.useState('');
  const [error, setError] = React.useState(null);

  const submit = () => {
    if (workspaceId === '') return setError(t('noWorkspace'));
    setError(null);
    onSubmit({ workspaceId, alias: alias.trim() });
  };

  return h(
    Modal,
    {
      title: t('newSessionTitle'),
      onClose: onCancel,
      onSubmit: submit,
      submitLabel: { cancel: t('cancel'), submit: t('createAndJoin'), busy: t('creating') },
      busy,
      error: error ?? controllerError,
      disabled: busy || workspaces.length === 0,
    },
    h('p', { className: 'dsc-note' }, t('newSessionHint')),
    h(
      'div',
      { className: 'dsc-field' },
      h('label', null, t('pickWorkspace')),
      h(
        'div',
        {
          className: 'dsc-ws-list',
          tabIndex: 0,
          onKeyDown: (event) => {
            if (event.target instanceof HTMLInputElement && event.target.type !== 'radio') return;
            if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
            event.preventDefault();
            const step = event.key === 'ArrowDown' ? 1 : -1;
            const currentIndex = workspaces.findIndex((item) => (item.workspaceId ?? item.id) === workspaceId);
            const next = workspaces[(Math.max(0, currentIndex) + step + workspaces.length) % workspaces.length];
            if (next !== undefined) setWorkspaceId(next.workspaceId ?? next.id);
          },
        },
        workspaces.length === 0
          ? h('p', { className: 'dsc-note' }, t('noWorkspace'))
          : workspaces.map((workspace) => {
              const id = workspace.workspaceId ?? workspace.id;
              return h(
                'label',
                { key: id, className: `dsc-ws${id === workspaceId ? ' is-active' : ''}` },
                h('input', {
                  type: 'radio',
                  name: 'dsc-workspace',
                  checked: id === workspaceId,
                  onChange: () => setWorkspaceId(id),
                }),
                h(
                  'span',
                  { className: 'dsc-ws-text' },
                  h('span', { className: 'dsc-ws-title' }, workspace.title ?? id),
                  h('span', { className: 'dsc-ws-path' }, workspace.path ?? ''),
                ),
              );
            }),
      ),
    ),
    h(
      'div',
      { className: 'dsc-field' },
      h('label', { htmlFor: 'dsc-new-alias' }, t('alias')),
      h('input', {
        id: 'dsc-new-alias',
        className: 'dsc-input',
        value: alias,
        maxLength: 32,
        placeholder: t('aliasPlaceholder'),
        onChange: (event) => setAlias(event.target.value),
      }),
    ),
  );
}

function Board({ ctx, slotProps }) {
  const active = useController();
  const state = useControllerState(active);
  const t = ctx.locale.bind(NS);
  const focus = useFocus();
  React.useSyncExternalStore((listener) => ctx.locale.subscribe(listener), () => t('title'));

  // Poll only while a surface renders: an unopened panel must cost nothing.
  React.useEffect(() => {
    if (!active) return undefined;
    active.attach();
    return () => active.detach();
  }, [active]);

  const [dialog, setDialog] = React.useState(null); // 'create' | 'add' | 'archive' | 'remove'
  const [pendingRemove, setPendingRemove] = React.useState(null);
  const [pickerGroups, setPickerGroups] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  // Panel focus: arrows walk every control of the board (buttons first-class), Enter activates.
  const panelRef = React.useRef(null);
  React.useEffect(() => {
    if (dialog === null) panelRef.current?.focus?.();
  }, [dialog]);

  const groups = (state.data?.groups ?? []).filter((group) => !group.archived);
  const group = groups.find((candidate) => candidate.id === state.groupId) ?? groups[0] ?? null;

  // The Workspace that owns the group's first member: where a brand-new member session goes.
  // The slot hook is captured once: calling it conditionally changed the hook count between
  // renders and React refused the whole panel (error #310).
  const workspacesHook = React.useRef(slotProps?.useWorkspaces);
  const readWorkspaces = workspacesHook.current ?? ((selector) => selector({ items: [] }));
  const workspaceItems = readWorkspaces((snapshot) => snapshot?.items);

  React.useEffect(() => {
    if (dialog !== 'create' && dialog !== 'add') return;
    if (!active) return;
    let live = true;
    setLoading(true);
    active
      .options()
      .then((value) => {
        if (live) setPickerGroups(value.groups);
      })
      .catch((failure) => {
        if (live) active.reportError(failure);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [dialog, active]);

  /** Create a blank session in one workspace, then re-read the list so it can be picked. */
  const createSession = async (workspaceGroup) => {
    const workspace = ctx.get('uiWorkspace');
    if (!workspace?.connectWorkspace) {
      active?.reportError(new Error('当前 DSH 版本不支持新建会话'));
      return undefined;
    }
    setCreating(true);
    try {
      const sessionId = await workspace.connectWorkspace(workspaceGroup.id);
      if (active) {
        const value = await active.options();
        setPickerGroups(value.groups);
      }
      return sessionId;
    } catch (failure) {
      active?.reportError(failure);
      return undefined;
    } finally {
      setCreating(false);
    }
  };

  /** Create a blank session beside the group's members and add it to the group in one step. */
  const addBlankMember = async () => {
    if (!group || !active) return;
    const first = group.members[0];
    const owner = (workspaceItems ?? []).find((workspace) => workspace.sessionIds?.includes(first?.sessionId));
    const workspaceId = owner?.workspaceId ?? owner?.id;
    if (workspaceId === undefined) {
      active.reportError(new Error('找不到该群所在的工作区，无法新建会话'));
      return;
    }
    const sessionId = await createSession({ id: workspaceId });
    if (sessionId === undefined) return;
    try {
      await active.execute({
        commandId: newCommandId(),
        action: 'addMember',
        groupId: group.id,
        member: { sessionId, alias: t('unnamed').slice(0, 32) },
      });
    } catch (failure) {
      active.reportError(failure);
    }
  };

  /** Create the chosen workspace's blank session and add it to the group. */
  const createMemberSession = async ({ workspaceId, alias }) => {
    const workspace = ctx.get('uiWorkspace');
    if (!active || !group || !workspace?.connectWorkspace) {
      active?.reportError(new Error('当前 DSH 版本不支持新建会话'));
      return;
    }
    setCreating(true);
    try {
      const sessionId = await workspace.connectWorkspace(workspaceId);
      await active.execute({
        commandId: newCommandId(),
        action: 'addMember',
        groupId: group.id,
        member: { sessionId, alias: alias.length > 0 ? alias : t('unnamed').slice(0, 32) },
      });
      setDialog(null);
    } catch (failure) {
      active.reportError(failure);
    } finally {
      setCreating(false);
    }
  };

  /** Arrow keys walk the board's controls; the focused one keeps its native Enter/Space. */
  const onPanelKey = (event) => {
    if (dialog !== null) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const step = event.key === 'ArrowDown' || event.key === 'ArrowRight'
      ? 1
      : event.key === 'ArrowUp' || event.key === 'ArrowLeft'
        ? -1
        : 0;
    if (step === 0 && event.key !== 'Home' && event.key !== 'End') return;
    const root = panelRef.current;
    if (root === null) return;
    // Only the functional controls take the arrow keys: the header actions and the group chips.
    // The member rows stay reachable with the mouse and with Tab.
    const scopes = [root.querySelector('.dsc-head'), root.querySelector('.dsc-groups')].filter((scope) => scope !== null);
    const items = scopes
      .flatMap((scope) => [...scope.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]')])
      .filter((node) => node instanceof HTMLElement && node.offsetParent !== null);
    if (items.length === 0) return;
    event.preventDefault();
    const current = items.indexOf(document.activeElement);
    const index = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? items.length - 1
        : current < 0
          ? (step > 0 ? 0 : items.length - 1)
          : (current + step + items.length) % items.length;
    const next = items[index];
    next?.focus();
    if (next !== undefined) revealInScroller(next);
  };

  /** Reordering persists because it decides the Alt+1…9 mapping. */
  const moveMember = async (member, delta) => {
    if (!active || !group) return;
    const index = group.members.findIndex((candidate) => candidate.id === member.id);
    if (index < 0) return;
    try {
      await active.execute({
        commandId: newCommandId(),
        action: 'moveMember',
        groupId: group.id,
        memberId: member.id,
        toIndex: index + delta,
      });
    } catch (failure) {
      active.reportError(failure);
    }
  };

  const openSession = (member) => {
    const workspace = ctx.get('uiWorkspace');
    if (!workspace) return;
    workspace.openSession(member.sessionId);
  };

  const removeMember = async () => {
    if (!group || !pendingRemove) return;
    await active
      .execute({ commandId: newCommandId(), action: 'removeMember', groupId: group.id, memberId: pendingRemove.id })
      .then(() => {
        setPendingRemove(null);
        setDialog(null);
      })
      .catch(() => {});
  };

  const archiveGroup = async () => {
    if (!group) return;
    await active
      .execute({ commandId: newCommandId(), action: 'archiveGroup', groupId: group.id })
      .then(() => setDialog(null))
      .catch(() => {});
  };

  return h(
    'div',
    { className: 'dsc-root', ref: panelRef, tabIndex: -1, onKeyDown: onPanelKey },
    h('style', null, CSS),
    h(
      'header',
      { className: 'dsc-head' },
      h(
        'h2',
        { className: 'dsc-head-title' },
        t('title'),
        group ? h('span', { className: 'dsc-count' }, `${group.members.length} ${t('members')}`) : null,
      ),
      h(
        'div',
        { className: 'dsc-actions' },
        group
          ? h(
              Btn,
              { onClick: () => (focus.on ? exitFocus() : enterFocus()), disabled: !active },
              h(Icon, { name: focus.on ? 'back' : 'users', size: 14 }),
              focus.on ? t('backToBoard') : t('focusOn'),
            )
          : null,
        group
          ? h(
              Btn,
              { onClick: () => setDialog('newSession'), disabled: !active || state.busy || creating },
              h(Icon, { name: 'plus', size: 14 }),
              creating ? t('creating') : t('newBlank'),
            )
          : null,
        group
          ? h(
              Btn,
              { onClick: () => setDialog('add'), disabled: !active || state.busy },
              h(Icon, { name: 'users', size: 14 }),
              t('addMember'),
            )
          : null,
        group ? h(Btn, { onClick: () => setDialog('archive'), disabled: !active || state.busy }, t('archive')) : null,
        h(
          Btn,
          { primary: true, onClick: () => setDialog('create'), disabled: !active || state.busy },
          h(Icon, { name: 'plus', size: 14 }),
          t('create'),
        ),
      ),
    ),
    groups.length > 1
      ? h(
          'div',
          { className: 'dsc-groups' },
          groups.map((candidate) =>
            h(
              'button',
              {
                key: candidate.id,
                type: 'button',
                className: `dsc-chip${candidate.id === group?.id ? ' is-active' : ''}`,
                onClick: () => active?.select(candidate.id),
              },
              candidate.name,
            ),
          ),
        )
      : null,
    group
      ? h(
          'div',
          { className: 'dsc-groupbar' },
          h('h3', { className: 'dsc-groupname' }, group.name),
          group.goal ? h('p', { className: 'dsc-goal' }, group.goal) : null,
        )
      : null,
    h(
      'div',
      { className: 'dsc-body' },
      !active
        ? h(
            'div',
            { className: 'dsc-empty' },
            h('p', { className: 'dsc-empty-title' }, state.error ? t('unavailable') : t('waiting')),
            state.error ? h('p', { className: 'dsc-empty-hint' }, state.error) : null,
          )
        : !group
          ? h(
              'div',
              { className: 'dsc-empty' },
              h('p', { className: 'dsc-empty-title' }, t('empty')),
              h('p', { className: 'dsc-empty-hint' }, t('emptyHint')),
            )
          : h(
              'div',
              { className: 'dsc-box' },
              h(
              'div',
              { className: 'dsc-members' },
              group.members.length === 0
                ? h('p', { className: 'dsc-note', style: { padding: '10px 2px' } }, t('noMembers'))
                : group.members.map((member, index) =>
                    h(MemberRow, {
                      key: member.id,
                      t,
                      member,
                      busy: state.busy,
                      active: member.id === focus.memberId,
                      hint: index < 9 ? `Alt+${index + 1}` : undefined,
                      onSelect: (target) => setFocus({ memberId: target.id }),
                      onOpen: openSession,
                      onMove: (target, delta) => moveMember(target, delta),
                      canUp: index > 0,
                      canDown: index < group.members.length - 1,
                      onRemove: (target) => {
                        setPendingRemove(target);
                        setDialog('remove');
                      },
                    }),
                  ),
              ),
            ),
    ),
    state.error && active
      ? h('p', { className: 'dsc-note', role: 'status', style: { padding: '0 20px 12px' } }, state.error)
      : null,
    dialog === 'newSession' && active && group
      ? h(NewSessionForm, {
          t,
          workspaces: workspaceItems ?? [],
          busy: creating,
          controllerError: state.error,
          onCancel: () => setDialog(null),
          onSubmit: createMemberSession,
        })
      : null,
    dialog === 'create' && active
      ? h(CreateGroupForm, {
          t,
          controller: active,
          groups: pickerGroups,
          loading,
          controllerError: state.error,
          onCreateSession: createSession,
          creating,
          onDone: () => setDialog(null),
          onCancel: () => setDialog(null),
        })
      : null,
    dialog === 'add' && active && group
      ? h(AddMemberForm, {
          t,
          controller: active,
          group,
          existing: group.members.map((member) => member.sessionId),
          groups: pickerGroups,
          loading,
          controllerError: state.error,
          onCreateSession: createSession,
          creating,
          onDone: () => setDialog(null),
          onCancel: () => setDialog(null),
        })
      : null,
    dialog === 'remove' && active && pendingRemove
      ? h(
          Modal,
          {
            title: t('remove'),
            onClose: () => {
              setPendingRemove(null);
              setDialog(null);
            },
            onSubmit: removeMember,
            submitLabel: { cancel: t('cancel'), submit: t('remove'), busy: t('busy') },
            busy: state.busy,
            error: null,
          },
          h('p', { className: 'dsc-note' }, t('removeNote')),
          h('p', { className: 'dsc-note' }, pendingRemove.alias),
        )
      : null,
    dialog === 'archive' && active && group
      ? h(
          Modal,
          {
            title: t('archive'),
            onClose: () => setDialog(null),
            onSubmit: archiveGroup,
            submitLabel: { cancel: t('cancel'), submit: t('archive'), busy: t('busy') },
            busy: state.busy,
            error: null,
          },
          h('p', { className: 'dsc-note' }, t('archiveNote')),
          h('p', { className: 'dsc-note' }, group.name),
        )
      : null,
  );
}

/**
 * A surface that throws would otherwise leave a blank panel and no clue. This shows the failure in
 * place and reports it through the readiness marker, which Client inspection can read.
 */
const ReactComponentBase = React.Component ?? class {};
class PanelBoundary extends ReactComponentBase {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    const message = error instanceof Error ? error.message : String(error);
    reportDiagnostic?.(`sessionCardsPanic=${message.slice(0, 90)}`);
  }

  render() {
    const error = this.state.error;
    if (error === null || error === undefined) return this.props.children;
    const message = error instanceof Error ? error.message : String(error);
    const stack = (error instanceof Error ? error.stack ?? '' : '').split('\n').slice(1, 5).join('\n');
    return h(
      'div',
      { className: 'dsc-root' },
      h('style', null, CSS),
      h(
        'div',
        { className: 'dsc-body' },
        h('p', { className: 'dsc-error' }, `session-cards 渲染失败：${message}`),
        stack ? h('pre', { className: 'dsc-error', style: { whiteSpace: 'pre-wrap', fontSize: '11px' } }, stack) : null,
      ),
    );
  }
}

function SidebarEntry({ size, active }) {
  return h(Glyph, { size: size ?? 18, active: active === true });
}

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
  let marker;
  const publish = (key) => {
    try {
      marker?.();
      marker = ctx.slots.register({ name: 'contextMenu.content', key }, () => null);
    } catch {
      /* inspection only */
    }
  };
  ctx.effect(() => () => marker?.(), 'session-cards: readiness marker');
  reportDiagnostic = publish;

  try {
  focusCtx = ctx;
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
    if (currentShellSessionId !== undefined && currentShellSessionId !== member.sessionId) {
      navHistory.push(currentShellSessionId);
      if (navHistory.length > 24) navHistory.shift();
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
  selectMember = openMember;
  const stepMember = (delta) => {
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
  };
  enterFocus = (options) => {
    mountSidebarList();
    setFocus({ on: true });
    // Show whatever the shell has selected; switching members is an explicit key or click so
    // entering the group view never jumps the conversation somewhere unexpected. `clearPanel` is
    // false when a switch follows immediately: clearing the panel in the same tick made the shell
    // re-apply the previous session and swallow the switch.
    if (options?.clearPanel !== false) ctx.get('layout')?.selectPanel(null);
  };
  exitFocus = () => {
    unmountSidebarList();
    setFocus({ on: false });
    ctx.get('layout')?.selectPanel(PANEL_ID);
  };

  // Member shortcuts: the Shortcuts service refuses a bare Alt binding on the Web runtime
  // (its allow-list admits only a few primary combinations), so focus mode owns a keydown
  // listener instead. It exists only while focus mode is on.
  const memberCombo = (event) => {
    // `Alt+digit` is often taken by the window manager on Linux, so three combinations are
    // accepted: Alt, Alt+Shift and Ctrl+Alt.
    const plain = event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
    const withShift = event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey;
    const withCtrl = event.altKey && event.ctrlKey && !event.metaKey;
    if (!plain && !withShift && !withCtrl) return null;
    const digit = /^Digit([0-9])$/u.exec(event.code);
    if (digit !== null) return `digit:${digit[1]}`;
    if (event.code === 'Backquote') return 'back';
    // Arrow stepping stays on plain Alt (and Ctrl+Alt); Alt+Shift+arrows belong to scrolling.
    if (withShift) return null;
    if (event.code === 'ArrowUp') return 'prev';
    if (event.code === 'ArrowDown') return 'next';
    if (event.code === 'ArrowLeft') return 'back';
    return null;
  };

  const goBack = () => {
    const previous = navHistory.pop();
    if (previous === undefined) {
      exitFocus();
      return;
    }
    setFocus({ memberId: undefined });
    ctx.get('uiWorkspace')?.openSession(previous);
  };

  const onMemberKey = (event) => {
    const combo = memberCombo(event);
    if (combo === null) return;
    event.preventDefault();
    event.stopPropagation();
    const members = groupMembersOf(latestBoardState);
    publish(`sessionCardsKey=${combo}:members=${members.length}`);
    if (combo === 'back') {
      goBack();
      return;
    }
    if (combo === 'prev') {
      stepMember(-1);
      return;
    }
    if (combo === 'next') {
      stepMember(1);
      return;
    }
    const index = Number(combo.slice('digit:'.length));
    if (index === 0) {
      exitFocus();
      return;
    }
    const member = members[index - 1];
    if (member === undefined) return;
    publish(`sessionCardsKey=${combo}:members=${members.length}:focus=${String(focusState.on)}:to=${member.alias}`);
    if (focusState.on) {
      openMember(member);
      return;
    }
    // Enter the group view and switch in one press: the sidebar takeover re-renders the shell, so
    // the navigation goes out after it settles instead of being overwritten by it.
    enterFocus({ clearPanel: false });
    window.setTimeout(() => openMember(member), 0);
  };
  // Keyboard scrolling: DSH binds no key to the Conversation scroller (the shell's SCROLL_KEYS
  // only stop tail-following), and a plain container only scrolls while focused. This scrolls the
  // nearest scrollable ancestor of whatever sits under the pointer — no class names, no structure.
  let pointerX = 0;
  let pointerY = 0;
  const onPointerMove = (event) => {
    pointerX = event.clientX;
    pointerY = event.clientY;
  };
  const scrollableUnderPointer = () => {
    const points = [
      [pointerX, pointerY],
      [window.innerWidth / 2, window.innerHeight / 2],
    ];
    for (const [x, y] of points) {
      let node = document.elementFromPoint(x, y);
      while (node instanceof HTMLElement) {
        const overflowY = window.getComputedStyle(node).overflowY;
        if ((overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay')
          && node.scrollHeight > node.clientHeight + 1) return node;
        node = node.parentElement;
      }
    }
    return null;
  };
  const hasSelection = () => {
    const selection = window.getSelection?.();
    return selection !== undefined && selection !== null && selection.isCollapsed === false;
  };
  // Held keys run a per-frame scroll instead of one jump per repeat event, so holding Shift+↓
  // scrolls continuously and stops the moment the key is released or the window loses focus.
  const scrollLoop = { frame: 0, speed: 0, target: null, code: '' };
  const stopScrollLoop = () => {
    if (scrollLoop.frame !== 0) window.cancelAnimationFrame(scrollLoop.frame);
    scrollLoop.frame = 0;
    scrollLoop.speed = 0;
    scrollLoop.target = null;
    scrollLoop.code = '';
  };
  const runScrollLoop = (target, speed, code) => {
    stopScrollLoop();
    scrollLoop.target = target;
    scrollLoop.speed = speed;
    scrollLoop.code = code;
    let last = performance.now();
    const step = (now) => {
      if (scrollLoop.target === null) return;
      const elapsed = Math.min(64, now - last);
      last = now;
      scrollLoop.target.scrollTop += (scrollLoop.speed * elapsed) / 1000;
      scrollLoop.frame = window.requestAnimationFrame(step);
    };
    scrollLoop.frame = window.requestAnimationFrame(step);
  };
  const onScrollKeyUp = (event) => {
    if (scrollLoop.code !== '' && event.code === scrollLoop.code) stopScrollLoop();
  };

  const onScrollKey = (event) => {
    // A card that already consumed the key (question navigation) keeps it.
    if (event.defaultPrevented || event.ctrlKey || event.metaKey) return;
    const plain = !event.shiftKey && !event.altKey;
    const plainShift = event.shiftKey && !event.altKey;
    const altWith = event.altKey;
    if (!plain && !plainShift && !altWith) return;
    const page = window.innerHeight * 0.85;
    let delta;
    if (event.code === 'PageDown') delta = page;
    else if (event.code === 'PageUp') delta = -page;
    else if (event.code === 'ArrowDown') delta = 70;
    else if (event.code === 'ArrowUp') delta = -70;
    else return;
    if (!plain && !plainShift && !(altWith && event.shiftKey)) return; // Alt alone only pages
    // A pending card owns the plain arrows: letting the scroller take them moved the card out from
    // under the user, which read as the cursor jumping to a different box. Page keys still scroll.
    if (plain && (event.code === 'ArrowUp' || event.code === 'ArrowDown') && pendingCard() !== null) {
      publish(`sessionCardsScroll=${event.code}:held-by-card`);
      return;
    }
    const held = (why) => {
      publish(`sessionCardsScroll=${event.code}:${why}`);
    };
    const focused = document.activeElement;
    if (focused instanceof HTMLElement
      && focused.closest('.dsc-root, .dsc-members, .dsc-picks, .dsc-ws-list, .dsc-overlay') !== null) {
      return; // our own list is navigating with these keys
    }
    const field = editableField(focused);
    const arrow = event.code === 'ArrowUp' || event.code === 'ArrowDown';
    const edge = event.code === 'ArrowUp' ? 'start' : 'end';
    if (field !== null) {
      // Page keys never scroll out of a focused field.
      if (!arrow) {
        held('held-by-field');
        return;
      }
      // Shift+Arrow selects text in single-line fields and in dialog fields: leave those alone.
      if (plainShift
        && (field.tagName === 'INPUT'
          || field.closest('[role="dialog"], [aria-modal="true"], .dsc-overlay, .dsc-modal') !== null)) {
        held('held-by-field');
        return;
      }
      // Multiline text keeps the caret until it reaches the edge the arrow would leave from.
      if (!caretAtEdge(field, edge)) {
        held('held-by-caret');
        return;
      }
    } else if (plainShift && hasSelection()) {
      held('held-by-selection');
      return;
    }
    // Resolve the pane *before* consuming the key: a capture-phase listener that stops every
    // arrow would hide them from the shell's own controls (question cards, selects, lists).
    const target = scrollableUnderPointer();
    if (target === null) {
      publish(`sessionCardsScroll=${event.code}:no-scrollable-pane`);
      return;
    }
    publish(`sessionCardsScroll=${event.code}:scrolling`);
    event.preventDefault();
    event.stopPropagation();
    if (event.repeat) return; // the loop already runs; swallow the repeats
    const perSecond = delta < 0 ? -1 : 1;
    const speed = Math.abs(delta) > 100 ? 1500 : 560;
    runScrollLoop(target, perSecond * speed, event.code);
  };

  // The editable the user actually types in (the composer), remembered across focus moves. The
  // approval card takes focus to answer a key, so "what was focused" is the card — not the field
  // the caret must return to.
  const FIELD_SELECTOR = 'input, textarea, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]';
  const CARD_SELECTOR = '[data-approval-key], [data-question-key], [data-plan-review-key]';
  let lastComposer = null;
  const onFocusIn = (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.closest(CARD_SELECTOR) !== null) return;
    const field = target.closest(FIELD_SELECTOR);
    if (field instanceof HTMLElement) lastComposer = field;
  };
  /** Fallback when the remembered field was replaced by a re-render. */
  const visibleComposer = () => {
    const nodes = [...document.querySelectorAll('textarea, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]')];
    for (let index = nodes.length - 1; index >= 0; index -= 1) {
      const node = nodes[index];
      if (!(node instanceof HTMLElement)) continue;
      if (node.offsetParent === null) continue;
      if (node.closest('.dsc-overlay, [role="dialog"], [aria-modal="true"]') !== null) continue;
      return node;
    }
    return null;
  };
  /** Hand the caret back after a card was answered with the keyboard. */
  const restoreFocus = (preferred, options) => {
    // A late retry from an earlier card must not pull the caret out of a card the user has since
    // moved to.
    const origin = options?.card ?? null;
    const take = () => {
      const focused = document.activeElement;
      const focusedCard = focused instanceof HTMLElement ? focused.closest(CARD_SELECTOR) : null;
      if (focusedCard !== null && focusedCard !== origin) return;
      const usable = [preferred, lastComposer].find(
        (node) => node instanceof HTMLElement && node.isConnected && node.closest(CARD_SELECTOR) === null,
      );
      const element = usable ?? visibleComposer();
      if (element === null) return;
      const active = document.activeElement;
      if (active === element) return;
      // Never steal from a field the user is typing in right now — but the answered card's own
      // field must not hold the caret: the user just finished with that card.
      const activeInCard = active instanceof HTMLElement && active.closest(CARD_SELECTOR) !== null;
      if (active instanceof HTMLElement && active.closest(FIELD_SELECTOR) !== null && !activeInCard) return;
      element.focus();
    };
    // Once synchronously (before React tears the answered card down), then while the continuation
    // render settles, and finally for a short window in case the shell re-renders the composer.
    // `defer` is for the path where the shell still has to see the key being dispatched: moving
    // focus now would make its own handler think the user left the card.
    if (options?.defer !== true) take();
    for (const delay of [0, 40, 150, 400, 800]) window.setTimeout(take, delay);
    let deadline = performance.now() + 1500;
    const cancelWatch = () => {
      deadline = 0;
    };
    window.addEventListener('pointerdown', cancelWatch, true);
    const tick = () => {
      if (performance.now() > deadline) {
        window.removeEventListener('pointerdown', cancelWatch, true);
        return;
      }
      take();
      window.requestAnimationFrame(tick);
    };
    window.requestAnimationFrame(tick);
  };

  // Approval cards answer Enter/Escape from inside themselves. When focus is elsewhere (usually the
  // composer) the shell ignores the key, so move focus into the card and replay the key there.
  const onApprovalKey = (event) => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key !== 'Enter' && event.key !== 'Escape') return;
    const active = document.activeElement;
    // A focused field only owns Enter while the user is actually writing something; an empty
    // composer is exactly the state in which Enter should approve.
    const owner = active instanceof HTMLElement
      ? active.closest('input, textarea, [contenteditable="true"], [contenteditable=""]')
      : null;
    if (owner !== null && !fieldIsEmpty(owner)) return;
    // The newest visible card: an answered one may still sit in the transcript above it.
    const card = [...document.querySelectorAll('[data-approval-key]')].filter(shownCard).pop();
    if (card === undefined || card.getAttribute('aria-busy') === 'true') return;
    if (card.contains(active)) {
      // Focus is already inside the card, so the shell's own handler answers this key. Do not
      // touch the event, and only hand the caret back after that handler has run.
      restoreFocus(active, { defer: true, card });
      return;
    }
    // Answering needs focus inside the card, so remember where the user was and put it back:
    // approving must not cost the composer its caret.
    const previous = active instanceof HTMLElement ? active : null;
    event.preventDefault();
    event.stopPropagation();
    card.querySelector('button, [role="button"]')?.focus();
    card.dispatchEvent(new KeyboardEvent('keydown', { key: event.key, bubbles: true }));
    restoreFocus(previous);
  };

  // Question cards (ask_user_question / plan review): digit selects an option, arrows walk the
  // options and Enter submits — the shells's own card submits on Enter over an option button.
  const editableField = (node) => (node instanceof HTMLElement
    ? node.closest('input, textarea, [contenteditable="true"], [contenteditable=""]')
    : null);
  /** Whether a focused field already holds text the user would lose. */
  const fieldIsEmpty = (field) => {
    if (field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement) return field.value.trim() === '';
    if (field instanceof HTMLElement && field.isContentEditable) return (field.textContent ?? '').trim() === '';
    return true;
  };
  /**
   * The shell renders responsive duplicates of some parts (inline/block variants, hidden mirrors),
   * which have no boxes at all. Counting them as targets made the cursor step onto an invisible
   * node — the highlight blinked and one visible option took two presses.
   */
  const onScreen = (node) => node instanceof HTMLElement
    && node.getClientRects().length > 0
    && node.closest('[aria-hidden="true"]') === null;
  const optionButtons = (card) => {
    // A choice is a radio/checkbox; the shell also puts copy and expand icon buttons inside the same
    // option row, and treating those as choices parked the cursor on a tiny corner button.
    const choices = [...card.querySelectorAll('[data-option-row] button[role="radio"]:not([disabled]), [data-option-row] button[role="checkbox"]:not([disabled])')]
      .filter(onScreen);
    if (choices.length > 0) return choices;
    const fallback = [...card.querySelectorAll('[role="radio"]:not([disabled]), [role="checkbox"]:not([disabled])')].filter(onScreen);
    if (fallback.length > 0) return fallback;
    return [...card.querySelectorAll('[data-option-row] button:not([disabled])')].filter(onScreen);
  };
  /**
   * One block per question. The host declares each question's choices as a `radiogroup` (single) or
   * `group` (multi-select), which is the only grouping a card exposes — a flat list over the whole
   * card would mix the questions together.
   */
  const questionBlocks = (card) => {
    // Every question counts, even one whose options the shell has not revealed yet: dropping those
    // collapsed the whole ring to a single question and made left/right look dead.
    const groups = [...card.querySelectorAll('[role="radiogroup"], [role="group"]')]
      .filter((node) => node instanceof HTMLElement);
    const blockOf = (element) => {
      const options = optionButtons(element);
      const fields = [...element.querySelectorAll('textarea, input:not([type="hidden"]), [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]')]
        .filter((node) => onScreen(node) && node.disabled !== true);
      return { element, options, targets: [...options, ...fields] };
    };
    if (groups.length === 0) return [blockOf(card)];
    // The shell renders a question's free-text row beside its options container, inside a
    // per-question wrapper: use that wrapper so the arrows can reach the text box too.
    return groups.map((group) => {
      const parent = group.parentElement;
      const ownsOne = parent instanceof HTMLElement
        && parent !== card
        && parent.querySelectorAll('[role="radiogroup"], [role="group"]').length === 1;
      return blockOf(ownsOne ? parent : group);
    });
  };
  // Painting a class onto the shell's nodes loses the highlight whenever the card re-renders, which
  // is what the user saw as a flicker. The class stays (harmless, and a static hint), while the
  // visible cursor is our own overlay cursorRing, repositioned every frame and immune to that.
  let cursorMark = null;
  let cursorRing = null;
  let ringFrame = 0;
  let paints = 0;
  let marks = 0;
  const ensureRing = () => {
    if (cursorRing !== null && cursorRing.isConnected === true) return cursorRing;
    cursorRing = document.createElement('div');
    cursorRing.className = 'dsc-card-ring';
    document.body.appendChild(cursorRing);
    return cursorRing;
  };
  const placeRing = () => {
    const node = ensureRing();
    const target = cursorMark;
    if (target === null || target.isConnected !== true || !onScreen(target)) {
      node.style.display = 'none';
      return;
    }
    const box = target.getBoundingClientRect();
    const width = box.width > 0 ? box.width : 0;
    const height = box.height > 0 ? box.height : 0;
    if (width === 0 || height === 0) {
      node.style.display = 'none';
      return;
    }
    paints += 1;
    node.style.display = 'block';
    node.style.left = `${box.left - 2}px`;
    node.style.top = `${box.top - 2}px`;
    node.style.width = `${width + 4}px`;
    node.style.height = `${height + 4}px`;
  };
  const runRing = () => {
    if (ringFrame !== 0) return;
    const step = () => {
      placeRing();
      if (cursorCard !== null && cursorCard.isConnected === true) {
        ringFrame = window.requestAnimationFrame(step);
        return;
      }
      ringFrame = 0;
      if (cursorRing !== null) cursorRing.style.display = 'none';
    };
    ringFrame = window.requestAnimationFrame(step);
  };
  const markCursor = (element) => {
    marks += 1;
    if (cursorMark === element) {
      runRing();
      return;
    }
    cursorMark?.classList?.remove('dsc-card-cursor');
    cursorMark = element;
    cursorMark?.classList?.add('dsc-card-cursor');
    runRing();
  };

  /** Own cursor {card, question, item}: the shell paints selection, not focus. */
  let questionCursor = { key: '', block: 0, index: -1 };
  // The card re-renders while the user navigates it, which replaces the marked node; the cursor is
  // therefore kept as (question, item) and re-applied whenever the card's DOM changes.
  let cursorCard = null;
  let cursorObserver = null;
  const repaintCursor = () => {
    if (cursorCard === null || cursorMark === null) return;
    const live = questionBlocks(cursorCard);
    const block = Math.min(Math.max(questionCursor.block, 0), live.length - 1);
    const target = live[block]?.targets[questionCursor.index];
    if (target === undefined || !onScreen(target) || target === cursorMark) return;
    cursorMark.classList?.remove('dsc-card-cursor');
    cursorMark = target;
    target.classList?.add('dsc-card-cursor');
  };
  const watchCursor = (card) => {
    if (cursorCard === card && cursorObserver !== null) return;
    cursorObserver?.disconnect();
    cursorCard = card;
    // Report the shape on sight: a wrong assumption about the shell's DOM is then readable without
    // asking anyone to press a key.
    const shape = questionBlocks(card);
    publish(`sessionCardsShape=b${shape.length}:o${shape.map((block) => block.options.length).join('.')}:t${shape.map((block) => block.targets.length).join('.')}`);
    if (typeof MutationObserver !== 'function') return;
    cursorObserver = new MutationObserver(() => window.requestAnimationFrame(repaintCursor));
    cursorObserver.observe(card, { childList: true, subtree: true });
  };
  // Rolling trace: the only way to see the order of actions a user actually performed.
  const questionTrace = [];
  const trace = (entry) => {
    questionTrace.push(entry);
    if (questionTrace.length > 24) questionTrace.shift();
    publish(`sessionCardsTrace=${questionTrace.join('|')}`);
  };
  const cardKeyOf = (card) => card.getAttribute('data-question-key')
    ?? card.getAttribute('data-plan-review-key')
    ?? 'card';
  /** Whether a vertical arrow may leave `field` in `edge`'s direction. */
  const caretAtEdge = (field, edge) => {
    if (field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement) {
      if (!field.value.includes('\n')) return true; // single line: nothing to move through
      const position = field.selectionStart ?? 0;
      return edge === 'start' ? position <= 0 : position >= field.value.length;
    }
    if (field instanceof HTMLElement && field.isContentEditable) {
      const text = field.textContent ?? '';
      if (!text.includes('\n')) return true;
      const selection = window.getSelection?.();
      if (selection === undefined || selection === null || selection.rangeCount === 0 || !selection.isCollapsed) return false;
      const range = selection.getRangeAt(0);
      const before = range.cloneRange();
      before.selectNodeContents(field);
      before.setEnd(range.startContainer, range.startOffset);
      const offset = before.toString().length;
      return edge === 'start' ? offset === 0 : offset >= text.length;
    }
    return false;
  };
  // The shell renders its own question navigation (labels from its eight dictionaries). Clicking it
  // keeps the shell's flow in sync — far more reliable than a second question model on our side.
  const STEP_LABELS = {
    next: new Set(['下一题', 'Next question', 'Next', '次の質問', '次へ', 'Siguiente pregunta', 'Siguiente', 'Question suivante', 'Suivant', 'Nächste Frage', 'Weiter', 'Следующий вопрос', 'Далее', 'Próxima pergunta', 'Próximo']),
    prev: new Set(['上一题', 'Previous question', '前の質問', 'Pregunta anterior', 'Question précédente', 'Vorherige Frage', 'Предыдущий вопрос', 'Pergunta anterior']),
  };
  const questionNavControl = (card, step) => {
    const labels = step > 0 ? STEP_LABELS.next : STEP_LABELS.prev;
    return [...card.querySelectorAll('button:not([disabled])')]
      .filter((node) => onScreen(node) && node.getAttribute('role') !== 'radio' && node.getAttribute('role') !== 'checkbox')
      .find((node) => labels.has((node.textContent ?? '').trim()) || labels.has((node.getAttribute('aria-label') ?? '').trim()))
      ?? null;
  };

  /**
   * A card counts as on screen when it has boxes: `offsetParent` is null both for hidden elements
   * and for anything inside a fixed overlay, which is exactly how the shell renders a dialog — the
   * keyboard layer used to ignore those cards entirely.
   */
  const shownCard = (node) => node instanceof HTMLElement
    && (typeof node.getClientRects === 'function' ? node.getClientRects().length > 0 : node.offsetParent !== null);
  /**
   * The card to act on: the one holding focus when the user is inside a card, otherwise the newest
   * one that is on screen (an answered card may still sit in the transcript).
   */
  const pendingCard = () => {
    const cards = [...document.querySelectorAll('[data-question-key], [data-plan-review-key]')].filter(shownCard);
    const focused = document.activeElement;
    if (focused instanceof HTMLElement) {
      const owning = cards.find((card) => card.contains(focused));
      if (owning !== undefined) return owning;
    }
    return cards[cards.length - 1] ?? null;
  };
  const onQuestionKey = (event) => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    const card = pendingCard();
    if (card === null) return;
    // Report what the card actually looks like: the only way to tell a wrong assumption about the
    // shell's DOM from a wrong decision in here.
    watchCursor(card);
    const probeBlocks = questionBlocks(card);
    trace(`?${event.code.replace('Arrow', '')}:cur=${questionCursor.block}.${questionCursor.index}:mk${marks}:pt${paints}:b${probeBlocks.length}:o${probeBlocks.map((block) => block.options.length).join('.')}:t${probeBlocks.map((block) => block.targets.length).join('.')}:a${document.activeElement?.tagName ?? '-'}`);
    const active = document.activeElement;
    const field = editableField(active);
    const inCardField = field !== null && card.contains(field);
    const isArrow = event.code === 'ArrowUp' || event.code === 'ArrowDown'
      || event.code === 'ArrowLeft' || event.code === 'ArrowRight';
    if (!inCardField && field !== null && !fieldIsEmpty(field)) {
      // The user is writing somewhere else. Typing keys (and Space) stay with that field, but the
      // arrows still drive the card: handing them to the scroller moved the card out from under
      // the user, which read as the cursor jumping to another box.
      if (!isArrow) return;
      const edge = event.code === 'ArrowUp' || event.code === 'ArrowLeft' ? 'start' : 'end';
      if (!caretAtEdge(field, edge)) return; // the caret still has room in the text
    }
    if (inCardField) {
      // Inside the card's own box: digits and Enter belong to it (the card submits on Enter), and
      // arrows leave only from the edge of the text.
      if (/^Digit([1-9])$/u.test(event.code)) return;
      const leaveUp = event.code === 'ArrowUp' || event.code === 'ArrowLeft';
      const leaveDown = event.code === 'ArrowDown' || event.code === 'ArrowRight';
      if (!leaveUp && !leaveDown) return;
      // Arrows leave the card's text box only once the caret has no room left, so typing and
      // selecting text keep working.
      if (leaveUp && !caretAtEdge(field, 'start')) return;
      if (leaveDown && !caretAtEdge(field, 'end')) return;
    }
    const blocks = questionBlocks(card);
    const key = cardKeyOf(card);
    if (questionCursor.key !== key) questionCursor = { key, block: 0, index: -1 };
    const blockCount = blocks.length;
    const usable = blocks.map((block) => block.targets.length);
    if (usable.every((count) => count === 0)) {
      publish(`sessionCardsQ=${event.code}:no-options:blocks=${blockCount}`);
      return;
    }
    // Keep the cursor on a question (and item) that still exists. A cursor of -1 means "not in the
    // list yet": the first arrow then enters at the top (or bottom). The focused control is only
    // used as an anchor for a cursor that already exists — the shell preselects recommended
    // options and focuses them, which otherwise made the first ↓ look like it skipped one.
    // Stay on the cursor's own question even when it has nothing to land on: skipping to the next
    // question that has controls is exactly what made the first question look skipped.
    const block = Math.min(Math.max(questionCursor.block, 0), blockCount - 1);
    const stored = questionCursor.index;
    const anchor = stored < 0 ? -1 : blocks[block].targets.indexOf(active);
    const index = (anchor >= 0 ? anchor : stored) < 0
      ? -1
      : Math.min(anchor >= 0 ? anchor : stored, Math.max(0, usable[block] - 1));
    const settle = (target, question, item, mode) => {
      questionCursor = { key, block: question, index: item };
      const scroller = (() => {
        let node = target.parentElement;
        while (node instanceof HTMLElement) {
          const overflowY = window.getComputedStyle(node).overflowY;
          if ((overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay')
            && node.scrollHeight > node.clientHeight + 1) return node;
          node = node.parentElement;
        }
        return null;
      })();
      const before = scroller?.scrollTop ?? 0;
      event.preventDefault();
      event.stopPropagation();
      markCursor(target);
      // Arrows only move the cursor: selecting here made the shell treat the question as answered
      // and advance to the next one, which read as "↓ jumped to the second question". Choosing is
      // an explicit act — a digit, or Space on the focused option (native button activation).
      const clicked = mode === 'select';
      const selectedBefore = blocks[question].options.findIndex((option) => option.getAttribute('aria-checked') === 'true');
      if (clicked) target.click();
      const selectedAfter = blocks[question].options.findIndex((option) => option.getAttribute('aria-checked') === 'true');
      // Moving the cursor must not take focus away from wherever the user is working.
      revealInScroller(target);
      const moved = (scroller?.scrollTop ?? 0) - before;
      publish(`sessionCardsQ=${event.code}:q${question + 1}/${blockCount}:i${item + 1}/${usable[question]}:scroll${moved >= 0 ? '+' : ''}${Math.round(moved)}`);
      trace(`${event.code === 'ArrowDown' ? 'D' : event.code === 'ArrowUp' ? 'U' : event.code === 'ArrowLeft' ? 'L' : event.code === 'ArrowRight' ? 'R' : event.code}=q${question + 1}/${blockCount}i${item + 1}/${usable[question]}${clicked ? '+c' : ''}:sel${selectedBefore}->${selectedAfter}`);
    };
    if (event.code === 'Space') {
      // Our own activation: the cursor item is chosen without focusing it first.
      // Same rule as the other keys: a field only owns the space bar while it holds text.
      if (field !== null && !card.contains(field) && !fieldIsEmpty(field)) return;
      const target = blocks[block].targets[index >= 0 ? index : 0];
      if (target === undefined) return;
      settle(target, block, index >= 0 ? index : 0, 'select');
      return;
    }
    const digit = /^Digit([1-9])$/u.exec(event.code);
    if (digit !== null) {
      // Numbers address the choices of the question the cursor is on, matching the labels shown.
      const option = blocks[block].options[Number(digit[1]) - 1];
      if (option === undefined) return;
      settle(option, block, Number(digit[1]) - 1, 'select');
      return;
    }
    if (event.code === 'Enter') {
      // Enter confirms instead of submitting an unfinished card: the shell answers a half-filled
      // request with "please answer this question first".
      const chosenIn = (blockIndex) => blocks[blockIndex].options.some((option) => option.getAttribute('aria-checked') === 'true');
      const unanswered = blocks.findIndex((candidate, blockIndex) => usable[blockIndex] > 0 && !chosenIn(blockIndex));
      if (unanswered >= 0) {
        if (!chosenIn(block)) {
          const cursorIndex = index >= 0 && index < blocks[block].options.length ? index : 0;
          const target = blocks[block].options[cursorIndex] ?? blocks[block].targets[cursorIndex];
          if (target === undefined) return;
          trace(`E=q${block + 1}:confirm`);
          settle(target, block, cursorIndex, 'select');
          return;
        }
        const targets = blocks[unanswered].targets;
        if (targets.length === 0) return;
        trace(`E=goto${unanswered + 1}`);
        settle(targets[0], unanswered, 0, 'follow');
        return;
      }
      const current = blocks[block];
      const target = current.options.find((option) => option.getAttribute('aria-checked') === 'true')
        ?? current.options[0]
        ?? current.targets[0];
      if (target === undefined) return;
      event.preventDefault();
      event.stopPropagation();
      const previous = active instanceof HTMLElement ? active : null;
      target.focus?.();
      target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      restoreFocus(previous, { card });
      trace('E=submit');
      return;
    }
    if (event.code === 'ArrowDown' || event.code === 'ArrowUp') {
      // Up/down stay inside the current question — never hop, so the first question is never
      // skipped. A question without reachable controls is still marked so the user sees it.
      if (usable[block] === 0) {
        event.preventDefault();
        markCursor(blocks[block].element);
        revealInScroller(blocks[block].element);
        trace(`${event.code === 'ArrowDown' ? 'D' : 'U'}=q${block + 1}/${blockCount}:empty`);
        return;
      }
      const step = event.code === 'ArrowDown' ? 1 : -1;
      const nextIndex = index < 0
        ? (step > 0 ? 0 : usable[block] - 1)
        : (index + step + usable[block]) % usable[block];
      const target = blocks[block].targets[nextIndex];
      if (target === undefined) return;
      settle(target, block, nextIndex, 'follow');
      return;
    }
    if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') {
      // Left/right switch questions. The shell's own control comes first: it also advances whatever
      // the shell shows, which is what the user sees as "the next question".
      const navStep = event.code === 'ArrowRight' ? 1 : -1;
      const navControl = questionNavControl(card, navStep);
      if (navControl !== null) {
        event.preventDefault();
        event.stopPropagation();
        navControl.click();
        trace(`${navStep > 0 ? 'R' : 'L'}=shell-nav`);
        return;
      }
      if (blockCount < 2) return;
      const step = navStep;
      // Prefer the next question that can actually be answered, but always move: a question whose
      // options the shell has not revealed yet still takes the cursor so paging is felt.
      let landed = -1;
      let target;
      let stopAt = -1;
      let chosenBlock = block;
      for (let hop = 1; hop < blockCount; hop += 1) {
        const candidate = (block + step * hop + blockCount * blockCount) % blockCount;
        if (usable[candidate] > 0) {
          chosenBlock = candidate;
          const targets = blocks[candidate].targets;
          const chosen = targets.find((node) => node.getAttribute('aria-checked') === 'true');
          target = chosen ?? targets[step > 0 ? 0 : targets.length - 1];
          landed = targets.indexOf(target);
          break;
        }
        if (blocks[candidate].options.length > 0) {
          // The question exists but its choices are not revealed yet: stop there so paging is felt,
          // instead of wrapping back to the question the user is already on (which looked like
          // left/right doing nothing at all).
          stopAt = candidate;
          break;
        }
      }
      if (landed < 0 || target === undefined) {
        const fallback = stopAt >= 0 ? stopAt : (block + step + blockCount) % blockCount;
        questionCursor = { key, block: fallback, index: -1 };
        event.preventDefault();
        event.stopPropagation();
        markCursor(blocks[fallback].element);
        revealInScroller(blocks[fallback].element);
        trace(`${step > 0 ? 'R' : 'L'}=q${fallback + 1}/${blockCount}:no-targets`);
        return;
      }
      settle(target, chosenBlock, landed, 'follow');
    }
  };

  ctx.effect(() => {
    const target = window;
    target.addEventListener('keydown', onMemberKey, true);
    target.addEventListener('keydown', onQuestionKey, true);
    target.addEventListener('keydown', onScrollKey, true);
    target.addEventListener('keydown', onApprovalKey, true);
    target.addEventListener('keyup', onScrollKeyUp, true);
    target.addEventListener('blur', stopScrollLoop);
    target.addEventListener('focusin', onFocusIn, true);
    target.addEventListener('pointermove', onPointerMove, { passive: true });
    return () => {
      stopScrollLoop();
      target.removeEventListener('keydown', onMemberKey, true);
      target.removeEventListener('keydown', onQuestionKey, true);
      target.removeEventListener('keydown', onScrollKey, true);
      target.removeEventListener('keydown', onApprovalKey, true);
      target.removeEventListener('keyup', onScrollKeyUp, true);
      target.removeEventListener('blur', stopScrollLoop);
      target.removeEventListener('focusin', onFocusIn, true);
      target.removeEventListener('pointermove', onPointerMove);
    };
  }, 'session-cards: keyboard layer');

  } catch (failure) {
    publish(`sessionCardsWiringError=${(failure instanceof Error ? failure.message : String(failure)).slice(0, 90)}`);
  }

  await ctx.inject(['remote.sessionCards'], (activeCtx) => {
    const next = new Controller(activeCtx.remote.sessionCards);
    controller = next;
    for (const listener of runtimeListeners) listener();
    void next.prime();
    return () => {
      next.dispose();
      if (controller === next) controller = null;
      for (const listener of runtimeListeners) listener();
    };
  });

  // The board is a client capability: another surface can open it from code, and its presence
  // reports that this half mounted its Remote namespace successfully.
  ctx.provide('sessionCards', {
    open: () => ctx.get('layout')?.selectPanel(PANEL_ID),
  });

  publish('sessionCardsReady');



}
