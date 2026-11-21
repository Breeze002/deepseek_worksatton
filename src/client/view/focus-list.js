/** The member list that takes over the sidebar browsing region in focus mode. */
import React from 'react';
import { NS } from '../constants.js';
import { CSS } from '../styles.js';
import { Glyph, Icon, MemberRow } from './parts.js';
import { focusCtx, getCurrentShellSessionId, newCommandId, setFocus, useController, useControllerState, useFocus, exitFocus, selectMember, setCurrentShellSessionId } from '../state.js';

const h = React.createElement;

function FocusList(props) {
  const ctx = focusCtx;
  // The host's own selector for "the session the main view retains". Captured once for the same
  // reason as the workspace hook above: a slot hook must never be called conditionally.
  const sessionsHook = React.useRef(props?.useSessions);
  const readSessions = sessionsHook.current ?? ((selector) => selector({ byId: {} }));
  setCurrentShellSessionId(readSessions(
    (state) => Object.values(state.byId).find((session) => session.retainedBy?.mainView > 0)?.id,
  ));
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
              active: member.sessionId === (getCurrentShellSessionId() ?? undefined) || member.id === focus.memberId,
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

function SidebarEntry({ size, active }) {
  return h(Glyph, { size: size ?? 18, active: active === true });
}


export { FocusList, SidebarEntry };
