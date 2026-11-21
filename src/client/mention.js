/**
 * The `@member` picker for a group chat's composer.
 *
 * The shell owns that composer and exposes no slot inside it, so this is an overlay placed above
 * whichever input the reader is typing in. Keys are captured before the shell sees them while the
 * list is open, and a choice is written back through the native value setter plus an `input` event,
 * which is what React's controlled field listens to.
 */
import React from 'react';
import { focusCtx, getCurrentShellSessionId, groupOfSession, useController, useControllerState } from './state.js';
import { reportDiagnostic } from './diagnostics.js';

const h = React.createElement;
/** `@token` at the caret, not preceded by a word character. */
const TOKEN = /(^|[^\w@])@([^\s@]{0,32})$/u;
const MAX_ROWS = 8;

const editable = (node) =>
  node instanceof HTMLTextAreaElement
  || (node instanceof HTMLInputElement && ['text', 'search', 'url', 'email', ''].includes(node.type));

/** The mention token immediately left of the caret, or null. */
export function mentionToken(field) {
  if (editable(field) !== true) return null;
  const caret = field.selectionStart ?? field.value.length;
  const before = field.value.slice(0, caret);
  const match = TOKEN.exec(before);
  if (match === null) return null;
  return { start: caret - match[2].length - 1, end: caret, query: match[2] };
}

/** Replace the token with the chosen alias, keeping the caret after it. */
export function applyMention(field, token, alias) {
  const next = `${field.value.slice(0, token.start)}@${alias} ${field.value.slice(token.end)}`;
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), 'value')?.set;
  if (setter === undefined) return false;
  setter.call(field, next);
  field.dispatchEvent(new Event('input', { bubbles: true }));
  const caret = token.start + alias.length + 2;
  field.setSelectionRange?.(caret, caret);
  return true;
}

function MentionPicker() {
  const ctx = focusCtx;
  const active = useController();
  const state = useControllerState(active);
  const [open, setOpen] = React.useState(null); // { field, token, box }
  const [index, setIndex] = React.useState(0);
  const handler = React.useRef(null);
  /** The composer we are serving: the shell may blur it while re-rendering, so it is remembered. */
  const field = React.useRef(null);
  const lastReport = React.useRef('');

  // Only the group chat's own Session addresses members.
  const current = getCurrentShellSessionId();
  const owner = groupOfSession(state, current);
  const isChat = owner !== null && owner.member === null;
  const members = isChat ? owner.group.members : [];

  const refresh = React.useCallback((event) => {
    const target = event?.target;
    const candidate = editable(target) === true
      ? target
      : (field.current !== null && field.current.isConnected === true ? field.current : null);
    if (isChat !== true || candidate === null) {
      setOpen(null);
      return;
    }
    field.current = candidate;
    const token = mentionToken(candidate);
    if (token === null) {
      setOpen(null);
      return;
    }
    const measured = candidate.getBoundingClientRect();
    // A zero box (a re-layout in flight) must not drop the list: fall back to a sane position.
    const box = measured.width === 0 && measured.height === 0
      ? { left: Math.max(12, window.innerWidth / 2 - 200), top: window.innerHeight - 120, width: 400, height: 60 }
      : measured;
    setOpen((previous) => {
      if (previous === null) reportDiagnostic(`sessionCardsMention=open:members=${members.length}`.slice(0, 160));
      return { field: candidate, token, box };
    });
  }, [isChat]);

  React.useEffect(() => {
    refresh();
    document.addEventListener('input', refresh, true);
    document.addEventListener('keyup', refresh, true);
    document.addEventListener('focusin', refresh, true);
    window.addEventListener('resize', refresh);
    return () => {
      document.removeEventListener('input', refresh, true);
      document.removeEventListener('keyup', refresh, true);
      document.removeEventListener('focusin', refresh, true);
      window.removeEventListener('resize', refresh);
    };
  }, [refresh]);

  // Everything below runs on every render, hooks included, so the list can never change hook order.
  const query = open === null ? '' : open.token.query.toLowerCase();
  const matches = open === null
    ? []
    : members
        .filter((member) => query === '' || (member.alias ?? '').toLowerCase().includes(query))
        .slice(0, MAX_ROWS);
  const cursorIndex = matches.length === 0 ? 0 : Math.min(index, matches.length - 1);
  const chosen = matches[cursorIndex];

  const choose = (member) => {
    if (member === undefined || open === null) return;
    if (applyMention(open.field, open.token, member.alias) === true) setOpen(null);
  };

  const onKeyDown = (event) => {
    // Capture runs before the shell's own composer handling, so an open list owns these keys.
    if (open === null || matches.length === 0) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setIndex((value) => (value + step + matches.length) % matches.length);
      return;
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      event.stopPropagation();
      choose(chosen);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setOpen(null);
      reportDiagnostic('sessionCardsMention=closed:escape');
    }
  };

  React.useEffect(() => {
    handler.current = onKeyDown;
  });
  React.useEffect(() => {
    const onPointerDown = (event) => {
      if (open === null) return;
      const target = event.target;
      if (target instanceof Element && (target.closest('.dsc-mention') !== null || target === open.field)) return;
      setOpen(null);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [open]);
  React.useEffect(() => {
    const listener = (event) => handler.current?.(event);
    window.addEventListener('keydown', listener, true);
    return () => window.removeEventListener('keydown', listener, true);
  }, []);

  const fieldDescription = (() => {
    const target = field.current;
    if (target === null) return 'field=none';
    const kind = target.tagName ?? '?';
    const contentEditable = target.isContentEditable === true ? '/ce' : '';
    const value = typeof target.value === 'string' ? target.value.slice(-6) : 'n/a';
    return `field=${kind}${contentEditable}:editable=${String(editable(target))}:value=${JSON.stringify(value)}`;
  })();
  const report = `sessionCardsMention=${open === null ? 'idle' : 'showing'}:chat=${String(isChat)}:members=${members.length}:matches=${matches.length}:${fieldDescription}`;
  if (report !== lastReport.current) {
    lastReport.current = report; // only transitions reach the marker
    reportDiagnostic(report.slice(0, 160));
  }
  if (open === null || matches.length === 0) return null;

  return h(
    'div',
    {
      className: 'dsc-mention',
      style: {
        left: `${open.box.left}px`,
        width: `${Math.min(Math.max(open.box.width, 200), 420)}px`,
        bottom: `${Math.max(12, window.innerHeight - open.box.top + 6)}px`,
      },
    },
    h('span', { className: 'dsc-mention-hint' }, `${matches.length} 位成员 · ↑↓ 选择 · Enter 采用`),
    matches.map((member, position) =>
      h(
        'button',
        {
          key: member.id,
          type: 'button',
          className: `dsc-mention-row${position === cursorIndex ? ' is-cursor' : ''}`,
          onMouseDown: (event) => event.preventDefault(),
          onClick: () => choose(member),
        },
        h('span', { className: 'dsc-mention-alias' }, `@${member.alias}`),
        h('span', { className: 'dsc-mention-title' }, member.title ?? ''),
      ),
    ),
  );
}

export { MentionPicker };
