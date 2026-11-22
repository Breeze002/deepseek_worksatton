/**
 * Member run status where the shell already shows a Session: a strip in the conversation header of
 * any member's conversation, and the member alias on the shell's own session rows.
 *
 * Both seats hand us the row's/session's `sessionId` and nothing else, so this reads the board from
 * the Runtime store and the shell's session index through the slot-provided selector hook.
 */
import React from 'react';
import { NS } from '../constants.js';
import { focusCtx, memberOfSession, useController, useControllerState } from '../state.js';

const h = React.createElement;

const translator = () => {
  const ctx = focusCtx;
  return ctx === null || ctx === undefined ? (key) => key : ctx.locale.bind(NS);
};

/** The member alias of a Session, on the shell's own session row (non-interactive by contract). */
function SessionRowAlias(props) {
  const active = useController();
  const state = useControllerState(active);
  const owner = memberOfSession(state, props?.sessionId);
  if (owner === null) return null;
  return h(
    'span',
    { className: 'dsc-alias-tag', title: `${owner.group.name} · ${owner.member.alias}` },
    `@${owner.member.alias}`,
  );
}

/**
 * An inert marker in the conversation header. The reading memory uses it to recognise the
 * conversation's own scroller instead of guessing from geometry alone.
 */
function ReadingAnchor() {
  // The anchor is always mounted with a Session. The `@member` list is no longer drawn here: it is
  // contributed to the shell's own composer menu as a trigger source (see `mention.js`), which is
  // why this seat no longer has to guess the composer's element or the current Session.
  return h('span', { className: 'dsc-reading-anchor', 'aria-hidden': true });
}

export { SessionRowAlias, ReadingAnchor };
