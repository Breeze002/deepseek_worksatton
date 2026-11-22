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
/**
 * The slot the marker occupies. It must be a slot this DSH actually declares: the shipped
 * `contextMenu.content` is absent here, so registering into it threw, the throw was swallowed by
 * design, and every marker — including every failure report — became invisible.
 * `conversation.input.overlay` is declared (floating entries inside the composer card) and an inert
 * occupant there renders nothing.
 */
export const MARKER_SLOT = 'conversation.input.overlay';
export const createPublisher = (ctx) => {
  // One live cell per marker kind (`<kind>=<detail>`), so a chatty marker such as
  // `sessionCardsFollow` cannot overwrite the one being investigated. Inspection then reads a
  // status board instead of a single latest value.
  const markers = new Map();
  const publish = (key) => {
    const kind = String(key).split('=')[0];
    try {
      markers.get(kind)?.();
      // A LIST slot keys its cell with `id`; `key` belongs to keyed slots such as `main`. Registering
      // a list slot with `key` never lands, and the catch below hides that — which cost a restart.
      markers.set(kind, ctx.slots.register({ name: MARKER_SLOT, id: String(key) }, () => null));
    } catch {
      /* inspection only */
    }
  };
  ctx.effect(() => () => {
    for (const dispose of markers.values()) dispose?.();
    markers.clear();
  }, 'session-cards: readiness marker');
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
