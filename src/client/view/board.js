/** The board panel: the plugin main surface. */
import React from 'react';
import { NS } from '../constants.js';
import { CSS } from '../styles.js';
import { Btn, Icon, MemberRow, revealInScroller } from './parts.js';
import { AddMemberForm, CreateGroupForm, Modal, NewSessionForm } from './dialogs.js';
import { groupMembersOf, newCommandId, setFocus, useController, useControllerState, useFocus, enterFocus, exitFocus } from '../state.js';

const h = React.createElement;

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

export { Board };
