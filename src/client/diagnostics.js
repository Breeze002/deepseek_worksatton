/** Client diagnostics: the inspection marker, the error boundary and title lookup. */
import React from 'react';
import { CSS } from './styles.js';

const h = React.createElement;

let reportDiagnostic = () => {};


function sessionTitleFrom(groups, sessionId) {
  for (const group of groups) {
    const hit = group.sessions.find((session) => session.sessionId === sessionId);
    if (hit) return hit.title;
  }
  return sessionId;
}

/** Reveal an element by scrolling its nearest scroll container — never the page around it. */

// The readiness marker lives here so the boundary can report through it without holding ctx.
export const setReportDiagnostic = (reporter) => {
  reportDiagnostic = reporter;
};
export const createPublisher = (ctx) => {
  // The marker slot is keyed, so several diagnostics can be readable at once: keeping a short
  // history means a later report (a scroll, a gesture) cannot hide an earlier one.
  const HISTORY = 8;
  const live = [];
  const publish = (key) => {
    try {
      live.push(ctx.slots.register({ name: 'contextMenu.content', key }, () => null));
      while (live.length > HISTORY) live.shift()?.();
    } catch {
      /* inspection only */
    }
  };
  ctx.effect(() => () => {
    for (const dispose of live.splice(0)) dispose();
  }, 'session-cards: readiness markers');
  return publish;
};

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


export { PanelBoundary, sessionTitleFrom, reportDiagnostic };
