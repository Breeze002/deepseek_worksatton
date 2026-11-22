/**
 * The member list as a cover over the sidebar's browsing region.
 *
 * The shell's `sidebar.workspaces` is a `single` slot whose renderer takes the first registration,
 * and the shipped session browser registers at startup — so a plugin cannot register into it. This
 * panel therefore covers that region instead: its own opaque surface, positioned from the region's
 * own box on every scroll and resize, with a switch back to the shipped session list.
 */
import React from 'react';
import { NS } from '../constants.js';
import { CSS } from '../styles.js';
import { Glyph, Icon, MemberRow } from './parts.js';
import {
  focusCtx,
  focusState,
  getCurrentShellSessionId,
  groupOfSession,
  memberStatus,
  newCommandId,
  openMember,
  getGroupChat,
  setFocus,
  stepMember,
  useController,
  useControllerState,
  useSessionIndex,
  useUnread,
} from '../state.js';

const h = React.createElement;

/** The sidebar region the shell's session browser occupies (hashed classes keep their readable part). */
const regionElement = () => document.querySelector('[class*="regionArea"]') ?? null;

function MemberPanel() {
  const ctx = focusCtx;
  const t = ctx === null || ctx === undefined ? (key) => key : ctx.locale.bind(NS);
  const active = useController();
  const state = useControllerState(active);
  const sessions = useSessionIndex();
  const unread = useUnread();
  const focus = focusState;
  const [dismissed, setDismissed] = React.useState(false);
  const [box, setBox] = React.useState(null);

  const currentSession = getCurrentShellSessionId();
  const owner = groupOfSession(state, currentSession);
  const group = owner === null ? null : owner.group;
  const visible = group !== null && dismissed !== true;

  React.useEffect(() => {
    setDismissed(false);
  }, [currentSession]);

  // Follow the region's box: it moves with the sidebar, the window and its own scroller.
  React.useEffect(() => {
    if (visible !== true) return undefined;
    let frame = 0;
    const place = () => {
      frame = 0;
      const element = regionElement();
      if (element === null) {
        setBox(null);
        return;
      }
      const rect = element.getBoundingClientRect();
      // The whole sidebar column: same x-range as the browsing region, full height — so the panel
      // icons, the new-session button and the settings area are covered too while a member is open.
      setBox({ left: rect.left, top: 0, width: rect.width, height: window.innerHeight });
    };
    const schedule = () => {
      if (frame !== 0) return;
      frame = window.requestAnimationFrame(place);
    };
    place();
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    const observer = typeof MutationObserver === 'function' ? new MutationObserver(schedule) : null;
    observer?.observe(document.body, { childList: true, subtree: true, attributes: true });
    return () => {
      if (frame !== 0) window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      observer?.disconnect();
    };
  }, [visible, currentSession]);

  if (visible !== true || box === null || box.width < 80) return null;

  const moveMember = async (member, delta) => {
    if (!active) return;
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

  const removeMember = async (member) => {
    if (!active) return;
    try {
      await active.execute({ commandId: newCommandId(), action: 'removeMember', groupId: group.id, memberId: member.id });
    } catch (failure) {
      active.reportError(failure);
    }
  };

  return h(
    'div',
    {
      className: 'dsc-member-panel',
      style: { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` },
    },
    h('style', null, CSS),
    h(
      'div',
      { className: 'dsc-mp-head' },
      h(Glyph, { size: 15, active: false }),
      h('span', { className: 'dsc-mp-title', title: group.name }, group.name),
      h(
        'button',
        {
          type: 'button',
          className: 'dsc-mp-chat',
          title: `${t('groupChat')} (Alt+Shift+G)`,
          onClick: () => {
            reportDiagnostic('sessionCardsChat=panel-head');
            void getGroupChat()?.open(group.id);
          },
        },
        t('groupChat'),
      ),
      h(
        'button',
        { type: 'button', className: 'dsc-mp-switch', onClick: () => setDismissed(true), title: t('showSessions') },
        t('showSessions'),
      ),
    ),
    h(
      'div',
      { className: 'dsc-mp-list' },
      h(MemberRow, {
        key: '__chat__',
        t,
        member: { id: '__chat__', alias: t('groupChat'), title: t('groupChatHint') },
        hint: 'Alt+Shift+G',
        active: currentSession === group.chatSessionId,
        onSelect: () => {
          reportDiagnostic('sessionCardsChat=panel-row');
          void getGroupChat()?.open(group.id);
        },
        onOpen: () => {
          reportDiagnostic('sessionCardsChat=panel-row');
          void getGroupChat()?.open(group.id);
        },
      }),
      group.members.map((member, index) =>
        h(MemberRow, {
          key: member.id,
          t,
          member,
          busy: state.busy,
          active: member.id === focus.memberId || member.sessionId === currentSession,
          hint: index < 9 ? `Alt+${index + 1}` : undefined,
          status: { ...memberStatus(member, sessions), unread: unread[member.id] === true },
          onSelect: (target) => openMember(target),
          onOpen: (target) => openMember(target),
          onMove: (target, delta) => moveMember(target, delta),
          canUp: index > 0,
          canDown: index < group.members.length - 1,
          onRemove: (target) => removeMember(target),
        }),
      ),
    ),
    h(
      'div',
      { className: 'dsc-mp-foot' },
      h('span', { className: 'dsc-side-hint' }, t('focusHint')),
      h(
        'button',
        { type: 'button', className: 'dsc-mp-nav', onClick: () => stepMember(1), title: t('nextMember') },
        h(Icon, { name: 'down', size: 12 }),
      ),
    ),
  );
}

export { MemberPanel };
