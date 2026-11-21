#!/usr/bin/env node
/**
 * DOM-level interaction tests.
 *
 * The Client half drives the shell's own DOM: arrow keys walk buttons, question and approval cards
 * answer from the keyboard, the caret returns to the composer, panes scroll under the pointer.
 * Static checks cannot see any of that, so this harness mounts the real bundle under jsdom with
 * real React, builds cards shaped like the ones `dsh-client-ui-user-questions` and
 * `dsh-client-ui-approval` render, dispatches real key events and asserts the result.
 *
 * jsdom has no layout engine, so every element that needs a box gets a virtual one here.
 *
 *   node scripts/dom-test.mjs
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import * as esbuild from 'esbuild';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* ------------------------------------------------------------------ bundle under test ------- */

const built = await esbuild.build({
  entryPoints: [resolve(root, 'src/client/index.js')],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: ['es2022'],
  minify: false, // failures must name real identifiers
  external: ['react'],
  loader: { '.js': 'jsx' },
  write: false,
  logLevel: 'warning',
});
const source = built.outputFiles[0].text;

/* ------------------------------------------------------------------ DOM environment --------- */

const noise = [];
const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true, url: 'http://localhost/' });
const { window } = dom;
const { document } = window;

// jsdom swallows exceptions thrown inside listeners; without this a broken handler looks exactly
// like a handler that never ran.
dom.virtualConsole.on('jsdomError', (error) => {
  noise.push(`[jsdomError] ${error.message}\n${String(error.stack ?? '').split('\n').slice(1, 4).join('\n')}`);
});
const realConsole = { error: console.error, warn: console.warn };
console.error = (...args) => noise.push(`[console.error] ${args.map((value) => (typeof value === 'string' ? value : JSON.stringify(value) ?? String(value))).join(' ').slice(0, 1200)}`);
console.warn = (...args) => noise.push(`[console.warn] ${args.map(String).join(' ').slice(0, 300)}`);

// jsdom reports no layout: give every element a box so visibility checks behave like a browser.
for (const proto of [window.HTMLElement.prototype]) {
  Object.defineProperty(proto, 'offsetParent', { get() { return this.parentElement ?? null; }, configurable: true });
  Object.defineProperty(proto, 'offsetWidth', { get: () => 120, configurable: true });
  Object.defineProperty(proto, 'offsetHeight', { get: () => 32, configurable: true });
}
Object.defineProperty(window.Element.prototype, 'scrollIntoView', { value: () => {}, writable: true, configurable: true });
Object.defineProperty(window.Element.prototype, 'getClientRects', {
  value() {
    // jsdom has no layout: an element reports no boxes when it or any ancestor is hidden, which is
    // how a browser treats display:none — the same signal the visibility checks rely on.
    let node = this;
    while (node instanceof window.Element) {
      if (node.hidden === true) return [];
      node = node.parentElement;
    }
    return [{}];
  },
  writable: true,
  configurable: true,
});
// jsdom does not implement `overflowY` in computed styles, so virtual scroll boxes announce
// themselves here; everything else falls back to the real computed style.
const scrollBoxes = new WeakSet();
const realComputedStyle = window.getComputedStyle.bind(window);
const virtualComputedStyle = (element, pseudo) => (scrollBoxes.has(element) ? { overflowY: 'auto' } : realComputedStyle(element, pseudo));
window.getComputedStyle = virtualComputedStyle;
globalThis.getComputedStyle = virtualComputedStyle;

let pointerTarget = null;
Object.defineProperty(document, 'elementFromPoint', { value: () => pointerTarget, writable: true, configurable: true });

for (const key of ['HTMLElement', 'HTMLTextAreaElement', 'HTMLInputElement', 'Element', 'Node', 'Event', 'KeyboardEvent', 'MouseEvent', 'getComputedStyle', 'MutationObserver', 'HTMLSelectElement']) {
  if (key in window) globalThis[key] = window[key];
}
globalThis.window = window;
globalThis.document = document;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { createRoot } = require('react-dom/client');

/* ------------------------------------------------------------------ virtual layout ---------- */

/** Give an element a scrollable box and a viewport position. */
function makeScrollable(element, { top, clientHeight, scrollHeight }) {
  Object.defineProperty(element, 'clientHeight', { value: clientHeight, configurable: true });
  Object.defineProperty(element, 'scrollHeight', { value: scrollHeight, configurable: true });
  let scrollTop = 0;
  Object.defineProperty(element, 'scrollTop', {
    get: () => scrollTop,
    set: (value) => {
      scrollTop = Math.max(0, Math.min(scrollHeight - clientHeight, value));
    },
    configurable: true,
  });
  scrollBoxes.add(element);
  element.getBoundingClientRect = () => ({ top, bottom: top + clientHeight, left: 0, right: 400, height: clientHeight, width: 400 });
  Object.defineProperty(element, 'virtualTop', { value: top, configurable: true });
  return element;
}

/** Position `element` inside `scroller` `offset` pixels below its content top. */
function placeIn(scroller, element, offset, height = 40) {
  element.getBoundingClientRect = () => {
    const top = scroller.virtualTop + offset - scroller.scrollTop;
    return { top, bottom: top + height, left: 0, right: 400, height, width: 400 };
  };
  return element;
}

/* ------------------------------------------------------------------ host-shaped cards ------- */

/**
 * A question card shaped like the shell renders it:
 *   card[data-question-key] > wrapper > [role=radiogroup|group] > div[data-option-row] > button
 * with the free-text row a *sibling* of the options container inside the same wrapper.
 */
function buildQuestionCard({ key = 'q1', questions, clientHeight = 120, optionHeight = 40, gap = 4 }) {
  const card = document.createElement('div');
  card.setAttribute('data-question-key', key);
  const scroller = makeScrollable(document.createElement('div'), {
    top: 200,
    clientHeight,
    scrollHeight: questions.reduce((sum, question) => sum + question.options.length * (optionHeight + gap) + 80, 0),
  });
  card.appendChild(scroller);
  const buttons = [];
  const fields = [];
  const wrappers = [];
  let offset = 8;
  for (const question of questions) {
    const wrapper = document.createElement('div');
    const group = document.createElement('div');
    group.setAttribute('role', question.multiSelect === true ? 'group' : 'radiogroup');
    for (const label of question.options) {
      const row = document.createElement('div');
      row.setAttribute('data-option-row', '');
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role', question.multiSelect === true ? 'checkbox' : 'radio');
      button.setAttribute('aria-checked', 'false');
      button.textContent = label;
      button.addEventListener('click', () => {
        if (question.multiSelect === true) {
          button.setAttribute('aria-checked', button.getAttribute('aria-checked') === 'true' ? 'false' : 'true');
          return;
        }
        for (const sibling of group.querySelectorAll('button')) sibling.setAttribute('aria-checked', 'false');
        button.setAttribute('aria-checked', 'true');
      });
      placeIn(scroller, button, offset, optionHeight);
      offset += optionHeight + gap;
      row.appendChild(button);
      group.appendChild(row);
      buttons.push(button);
    }
    wrapper.appendChild(group);
    wrappers.push(wrapper);
    if (question.freeText === true) {
      const textarea = document.createElement('textarea');
      placeIn(scroller, textarea, offset, 64);
      offset += 64 + gap;
      wrapper.appendChild(textarea);
      fields.push(textarea);
    }
    scroller.appendChild(wrapper);
  }
  return { card, scroller, buttons, fields, wrappers };
}

/** An approval card shaped like the shell renders it: it answers only while focus is inside. */
function buildApprovalCard(key = 'a1') {
  const card = document.createElement('div');
  card.setAttribute('data-approval-key', key);
  const allow = document.createElement('button');
  allow.textContent = 'allow';
  const reject = document.createElement('button');
  reject.textContent = 'reject';
  const seen = { allow: 0, reject: 0 };
  card.append(allow, reject);
  card.addEventListener('keydown', (event) => {
    if (!card.contains(document.activeElement)) return;
    if (event.key !== 'Enter' && event.key !== 'Escape') return;
    event.preventDefault();
    if (event.key === 'Enter') seen.allow += 1;
    else seen.reject += 1;
  });
  allow.addEventListener('click', () => {
    seen.allow += 1;
  });
  reject.addEventListener('click', () => {
    seen.reject += 1;
  });
  return { card, seen };
}

/* ------------------------------------------------------------------ harness ----------------- */

const BOARD = {
  formatVersion: 1,
  revision: 1,
  commands: [],
  groups: [
    {
      id: 'g1',
      name: 'group one',
      goal: '',
      archived: false,
      createdAt: 0,
      members: [
        { id: 'm1', sessionId: 'session-aaa', alias: 'alpha', title: 'first', cwd: '/tmp/a' },
        { id: 'm2', sessionId: 'session-bbb', alias: 'beta', title: 'second', cwd: '/tmp/b' },
      ],
    },
  ],
};

const registered = [];
const opened = [];

const context = {
  slots: {
    inject: (name, installer) => {
      installer();
      return () => {};
    },
    register: (options, component) => {
      registered.push({ name: options?.name, options, component });
      return () => {};
    },
  },
  locale: { register: () => () => {}, bind: () => (key) => key, subscribe: () => () => {} },
  remote: {
    $mount: async () => () => {},
    sessionCards: {
      snapshot: async () => ({ ok: true, value: BOARD }),
      // Park the long poll: a resolving promise would spin the loop forever inside a test.
      watch: async () => new Promise(() => {}),
      // Real shapes: the picker must be exercised with sessions, not only with the empty branch.
      options: async () => ({
        ok: true,
        value: {
          groups: [
            {
              id: 'ws-1',
              title: 'workspace one',
              sessions: [
                { sessionId: 'session-aaa', title: 'first', cwd: '/tmp/a' },
                { sessionId: 'session-bbb', title: 'second', cwd: '/tmp/b' },
                { sessionId: 'session-ccc', title: 'third', cwd: '/tmp/c' },
              ],
            },
            { id: 'ws-2', title: 'workspace two', sessions: [{ sessionId: 'session-ddd', title: 'fourth', cwd: '/tmp/d' }] },
          ],
        },
      }),
      execute: async () => ({ ok: true, value: BOARD }),
    },
  },
  effect: (callback) => {
    const disposer = callback();
    return typeof disposer === 'function' ? disposer : () => {};
  },
  get: (name) => {
    if (name === 'uiWorkspace') {
      return { openSession: (sessionId) => opened.push(sessionId), connectWorkspace: async () => 'session-new' };
    }
    if (name === 'layout') return { selectPanel: () => {} };
    return undefined;
  },
  provide: () => {},
  inject: async (_dependencies, callback) => {
    callback(context);
    return () => {};
  },
  logger: { warn: () => {} },
};

const moduleUnderTest = { exports: {} };
new Function('require', 'module', 'exports', source)(
  (specifier) => {
    if (specifier === 'react' || specifier === 'react/jsx-runtime') return React;
    throw new Error(`unexpected require: ${specifier}`);
  },
  moduleUnderTest,
  moduleUnderTest.exports,
);
const client = moduleUnderTest.exports;
await client.apply(context);
await new Promise((done) => setTimeout(done, 5));

const slotProps = {
  useWorkspaces: (selector) => selector({ items: [{ workspaceId: 'ws-1', title: 'ws', path: '/tmp/ws', sessionIds: ['session-aaa', 'session-bbb'] }] }),
  useSessions: (selector) => selector({ byId: { 'session-aaa': { id: 'session-aaa', retainedBy: { mainView: 1 } } } }),
};

/* ------------------------------------------------------------------ assertions -------------- */

let passed = 0;
const failures = [];
const check = (label, condition, detail = '') => {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${label}`);
    return;
  }
  failures.push(label);
  console.log(`  FAIL ${label}${detail === '' ? '' : ` — ${detail}`}`);
};
const key = (target, options) => {
  const event = new window.KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...options });
  target.dispatchEvent(event);
  return event;
};
const keyUp = (target, options) => {
  target.dispatchEvent(new window.KeyboardEvent('keyup', { bubbles: true, ...options }));
};
const tick = (ms = 30) => new Promise((done) => setTimeout(done, ms));
const active = () => document.activeElement;
const lastTrace = () => {
  const entry = [...registered]
    .reverse()
    .find((candidate) => candidate.name === 'contextMenu.content' && String(candidate.options.key).startsWith('sessionCardsTrace='));
  return entry === undefined ? '' : String(entry.options.key).replace('sessionCardsTrace=', '');
};

console.log('keyboard layer: keys it does not use stay with the shell');
const idle = document.createElement('span');
document.body.appendChild(idle);
const idleEvent = key(idle, { key: 'ArrowDown', code: 'ArrowDown' });
check('an unused arrow key is not consumed', !idleEvent.defaultPrevented);

/* ------------------------------------------------------------------ 1. board navigation ----- */

console.log('board: arrows walk the controls, Enter stays native');
const boardHost = document.createElement('div');
document.body.appendChild(boardHost);
const boardRoot = createRoot(boardHost);
const boardEntry = registered.find((entry) => entry.name === 'main');
await React.act(async () => {
  boardRoot.render(React.createElement(boardEntry.component, slotProps));
});
const panel = boardHost.querySelector('.dsc-root');
check('board renders', panel !== null);
panel.focus();
// The arrow ring covers the functional controls only; member rows are not part of it.
const functional = [panel.querySelector('.dsc-head'), panel.querySelector('.dsc-groups')]
  .filter((scope) => scope !== null)
  .flatMap((scope) => [...scope.querySelectorAll('button')]);
const controls = functional;
const memberRowButtons = [...panel.querySelectorAll('.dsc-row-main')];
check('board exposes its functional buttons', controls.length >= 4, `found ${controls.length}`);
check('the board has member rows too', memberRowButtons.length >= 1, `found ${memberRowButtons.length}`);
const arrowsPrevented = key(panel, { key: 'ArrowDown', code: 'ArrowDown' });
check('ArrowDown moves focus to the first control', active() === controls[0], `active=${active()?.tagName ?? 'none'}`);
check('ArrowDown prevents the page from scrolling', arrowsPrevented.defaultPrevented);
key(active(), { key: 'ArrowDown', code: 'ArrowDown' });
check('ArrowDown advances to the next control', active() === controls[1], `active=${active()?.tagName ?? 'none'}`);
key(active(), { key: 'End', code: 'End' });
check('End stops on the last functional control', active() === controls[controls.length - 1], `active=${active()?.textContent ?? 'none'}`);
check('the member rows stay out of the arrow ring', memberRowButtons.every((button) => button !== active()));
key(active(), { key: 'Home', code: 'Home' });
check('Home jumps back to the first control', active() === controls[0]);
const enterEvent = key(active(), { key: 'Enter', code: 'Enter' });
check('Enter is left to the control (not swallowed)', !enterEvent.defaultPrevented);
const addButton = controls.find((button) => (button.textContent ?? '').includes('addMember'));
await React.act(async () => {
  addButton?.click();
});
check('clicking a board button opens its dialog', boardHost.querySelector('.dsc-modal') !== null);

console.log('board: a slot hook that arrives late does not break the render');
const lateHost = document.createElement('div');
document.body.appendChild(lateHost);
const lateRoot = createRoot(lateHost);
await React.act(async () => {
  // First render without the workspace hook, second with it: a conditional hook call used to make
  // React refuse the whole panel (error #310) as soon as a dialog opened.
  lateRoot.render(React.createElement(boardEntry.component, { useSessions: slotProps.useSessions }));
});
await React.act(async () => {
  lateRoot.render(React.createElement(boardEntry.component, slotProps));
});
const lateError = lateHost.querySelector('.dsc-error');
check('the panel survives a late slot hook', lateError === null, lateError?.textContent?.slice(0, 80) ?? '');
await React.act(async () => {
  lateRoot.unmount();
});
lateHost.remove();

/* ------------------------------------------------------------------ 2. question card -------- */

console.log('question card: per-question cursor, digits, selection');
const single = buildQuestionCard({
  questions: [
    { options: ['one', 'two', 'three'], freeText: true },
    { options: ['alpha', 'beta'] },
  ],
});
document.body.appendChild(single.card);

key(active() ?? document.body, { key: 'ArrowDown', code: 'ArrowDown' });
check('the first ArrowDown puts the cursor on option 1', single.buttons[0].classList.contains('dsc-card-cursor'));
check('and does not choose for the user', single.buttons[0].getAttribute('aria-checked') === 'false');
key(active() ?? document.body, { key: 'ArrowDown', code: 'ArrowDown' });
check('the second ArrowDown moves the cursor to option 2', single.buttons[1].classList.contains('dsc-card-cursor') && !single.buttons[0].classList.contains('dsc-card-cursor'));
key(active() ?? document.body, { key: 'ArrowDown', code: 'ArrowDown' });
key(active() ?? document.body, { key: 'ArrowDown', code: 'ArrowDown' });
check('down stays inside the question and reaches its free-text row', single.fields[0].classList.contains('dsc-card-cursor'));
check('down never jumps to the next question on its own', single.buttons[3].getAttribute('aria-checked') === 'false');
key(active() ?? document.body, { key: 'ArrowRight', code: 'ArrowRight' });
check('right switches to the next question', single.buttons[3].classList.contains('dsc-card-cursor'));
check('switching questions marks its first option', single.buttons[3].classList.contains('dsc-card-cursor'));
key(active() ?? document.body, { key: 'Digit2', code: 'Digit2' });
check(
  'a digit chooses inside the current question only',
  single.buttons[4].getAttribute('aria-checked') === 'true' && single.buttons[3].getAttribute('aria-checked') === 'false',
  `q2opt2=${single.buttons[4].getAttribute('aria-checked')} q2opt1=${single.buttons[3].getAttribute('aria-checked')}`,
);
key(active() ?? document.body, { key: 'ArrowLeft', code: 'ArrowLeft' });
check('left switches back to question 1', single.buttons.slice(0, 4).some((node) => node.classList.contains('dsc-card-cursor')) || single.fields[0].classList.contains('dsc-card-cursor'));
single.fields[0].focus();
const typing = key(active(), { key: 'a', code: 'KeyA' });
check('typing in the free-text row is not swallowed', !typing.defaultPrevented);

console.log('question card: a preselected option is not skipped');
const preset = buildQuestionCard({ key: 'q3', questions: [{ options: ['recommended', 'other', 'third'] }] });
preset.buttons[0].setAttribute('aria-checked', 'true'); // the shell preselects recommended choices
document.body.appendChild(preset.card);
preset.buttons[0].focus(); // …and usually focuses it
key(active() ?? document.body, { key: 'ArrowDown', code: 'ArrowDown' });
check('the first ArrowDown stays on the preselected first option', /D=q1\/1i1\/3/u.test(lastTrace()), `trace=${lastTrace()}`);
check('and does not move the selection off it', preset.buttons[0].getAttribute('aria-checked') === 'true');
check('the cursor is visible on the first option', preset.buttons[0].classList.contains('dsc-card-cursor'));
key(active() ?? document.body, { key: 'ArrowDown', code: 'ArrowDown' });
check('the second ArrowDown moves the cursor to the second option', preset.buttons[1].classList.contains('dsc-card-cursor'));
check('the visible cursor moved with it', preset.buttons[1].classList.contains('dsc-card-cursor') && !preset.buttons[0].classList.contains('dsc-card-cursor'));
const beforeLeftRight = [active(), preset.buttons.map((button) => button.getAttribute('aria-checked')).join()];
key(active() ?? document.body, { key: 'ArrowRight', code: 'ArrowRight' });
key(active() ?? document.body, { key: 'ArrowLeft', code: 'ArrowLeft' });
check(
  'left/right do nothing when the card has a single question',
  active() === beforeLeftRight[0] && preset.buttons.map((button) => button.getAttribute('aria-checked')).join() === beforeLeftRight[1],
);
preset.card.remove();

console.log('question card: a question without controls is never skipped');
const collapsed = buildQuestionCard({ key: 'q4', questions: [{ options: [] }, { options: ['alpha', 'beta'] }] });
document.body.appendChild(collapsed.card);
key(active() ?? document.body, { key: 'ArrowDown', code: 'ArrowDown' });
check('down does not jump to the second question', collapsed.buttons[0].getAttribute('aria-checked') === 'false');
check('the empty question is marked instead', collapsed.wrappers[0].classList.contains('dsc-card-cursor'));
key(active() ?? document.body, { key: 'ArrowRight', code: 'ArrowRight' });
check('right switches to the second question', collapsed.buttons[0].classList.contains('dsc-card-cursor'));
check('and marks its first option', collapsed.buttons[0].classList.contains('dsc-card-cursor'));
key(active() ?? document.body, { key: 'ArrowDown', code: 'ArrowDown' });
check('down then moves inside that question', collapsed.buttons[1].classList.contains('dsc-card-cursor'));
key(active() ?? document.body, { key: 'Digit1', code: 'Digit1' });
check('a digit chooses it', collapsed.buttons[0].getAttribute('aria-checked') === 'true');
collapsed.card.remove();

console.log('question card: Enter confirms, then advances, then submits');
const enterCard = buildQuestionCard({ key: 'q5', questions: [{ options: ['a1', 'a2'] }, { options: ['b1', 'b2'] }] });
document.body.appendChild(enterCard.card);
let submits = 0;
let refused = 0;
const answeredIn = (index) => enterCard.buttons.slice(index * 2, index * 2 + 2).some((button) => button.getAttribute('aria-checked') === 'true');
// Mirror the shell: Enter over an option submits the card, and an unfinished card is refused.
for (const button of enterCard.buttons) {
  button.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (answeredIn(0) && answeredIn(1)) submits += 1;
    else refused += 1;
  });
}
key(active() ?? document.body, { key: 'ArrowDown', code: 'ArrowDown' });
key(active() ?? document.body, { key: 'Enter', code: 'Enter' });
check('Enter confirms the option under the cursor', enterCard.buttons[0].getAttribute('aria-checked') === 'true');
check('and does not hand an unfinished card to the shell', submits === 0 && refused === 0, `submits=${submits} refused=${refused}`);
key(active() ?? document.body, { key: 'Enter', code: 'Enter' });
check('a second Enter moves on to the unanswered question', enterCard.buttons[2].classList.contains('dsc-card-cursor'), `active=${active()?.textContent ?? 'none'}`);
key(active() ?? document.body, { key: 'Enter', code: 'Enter' });
check('Enter confirms that question too', enterCard.buttons[2].getAttribute('aria-checked') === 'true');
key(active() ?? document.body, { key: 'Enter', code: 'Enter' });
check('with every question answered Enter submits', submits === 1, `submits=${submits} refused=${refused}`);
enterCard.card.remove();

console.log('question card: hidden duplicates are never targets');
const duplicated = buildQuestionCard({ key: 'q10', questions: [{ options: ['v1', 'v2'] }] });
// Mirror the shell's responsive duplication: a second, hidden copy of the same question.
const hiddenCopy = duplicated.card.cloneNode(true);
hiddenCopy.hidden = true;
duplicated.card.appendChild(hiddenCopy);
document.body.appendChild(duplicated.card);
const visibleButtons = [...duplicated.card.querySelectorAll('[data-option-row] button')].filter((button) => button.getClientRects().length > 0);
const allButtons = [...duplicated.card.querySelectorAll('[data-option-row] button')];
check('the card carries a hidden duplicate', allButtons.length === 4 && visibleButtons.length === 2, `all=${allButtons.length} visible=${visibleButtons.length}`);
key(active() ?? document.body, { key: 'ArrowDown', code: 'ArrowDown' });
check('the first press marks the first visible option', visibleButtons[0].classList.contains('dsc-card-cursor'));
check('nothing is marked inside the hidden copy', allButtons.filter((button) => button.getClientRects().length === 0).every((button) => !button.classList.contains('dsc-card-cursor')));
key(active() ?? document.body, { key: 'ArrowDown', code: 'ArrowDown' });
check('the second press reaches the second visible option', visibleButtons[1].classList.contains('dsc-card-cursor'), `marked=${allButtons.map((button) => (button.classList.contains('dsc-card-cursor') ? 1 : 0)).join('')}`);
duplicated.card.remove();

console.log('question card: the cursor survives the shell re-rendering the card');
const rerender = buildQuestionCard({ key: 'q9', questions: [{ options: ['r1', 'r2', 'r3'] }] });
document.body.appendChild(rerender.card);
key(active() ?? document.body, { key: 'ArrowDown', code: 'ArrowDown' });
key(active() ?? document.body, { key: 'ArrowDown', code: 'ArrowDown' });
check('the cursor sits on the second option', rerender.buttons[1].classList.contains('dsc-card-cursor'));
// Replace the option rows the way React does when it re-renders the card.
const group = rerender.card.querySelector('[role="radiogroup"]');
group.innerHTML = ['r1', 'r2', 'r3']
  .map((label, index) => `<div data-option-row="${index}"><button type="button" role="radio" aria-checked="false">${label}</button></div>`)
  .join('');
await tick(40);
const fresh = [...group.querySelectorAll('button')];
check('the highlight is re-applied to the new nodes', fresh[1].classList.contains('dsc-card-cursor'), `marked=${fresh.map((button) => (button.classList.contains('dsc-card-cursor') ? 1 : 0)).join('')}`);
rerender.card.remove();

console.log('question card: Space picks the cursor item without stealing focus');
const spaceCard = buildQuestionCard({ key: 'q6', questions: [{ options: ['x1', 'x2'] }] });
document.body.appendChild(spaceCard.card);
const composerForSpace = document.createElement('textarea');
document.body.appendChild(composerForSpace);
composerForSpace.focus();
key(composerForSpace, { key: 'ArrowDown', code: 'ArrowDown' });
check('the cursor moves while the caret stays put', spaceCard.buttons[0].classList.contains('dsc-card-cursor') && active() === composerForSpace);
key(composerForSpace, { key: ' ', code: 'Space' });
check('Space chooses the cursor item', spaceCard.buttons[0].getAttribute('aria-checked') === 'true');
check('and the caret still has not moved', active() === composerForSpace, `active=${active()?.tagName ?? 'none'}`);
spaceCard.card.remove();
composerForSpace.remove();

console.log('question card: a card inside a fixed overlay is found, and the focused card wins');
const older = buildQuestionCard({ key: 'q7', questions: [{ options: ['old1', 'old2'] }] });
const overlay = document.createElement('div');
overlay.style.position = 'fixed';
overlay.appendChild(older.card);
document.body.appendChild(overlay);
const newer = buildQuestionCard({ key: 'q8', questions: [{ options: ['new1', 'new2'] }] });
document.body.appendChild(newer.card);
older.buttons[1].focus();
key(older.buttons[1], { key: 'ArrowDown', code: 'ArrowDown' });
check('the arrows act on the card the user is in, not the newest one', older.buttons.some((button) => button.classList.contains('dsc-card-cursor')));
check('the newer card is left alone', newer.buttons.every((button) => !button.classList.contains('dsc-card-cursor')));
overlay.remove();
newer.card.remove();

console.log('question card: scrolling keeps the cursor in view');
check('the card scrolled to reveal the cursor', single.scroller.scrollTop > 0, `scrollTop=${single.scroller.scrollTop}`);
single.card.remove();

/* ------------------------------------------------------------------ 3. multi-select ---------- */

console.log('question card: multi-select does not pick for you');
const multi = buildQuestionCard({ key: 'q2', questions: [{ options: ['red', 'green', 'blue'], multiSelect: true }] });
document.body.appendChild(multi.card);
key(active() ?? document.body, { key: 'ArrowDown', code: 'ArrowDown' });
check(
  'ArrowDown only marks without checking anything',
  multi.buttons.every((button) => button.getAttribute('aria-checked') === 'false') && multi.buttons[0].classList.contains('dsc-card-cursor'),
  `checked=${multi.buttons.map((button) => button.getAttribute('aria-checked')).join()}`,
);
key(active() ?? document.body, { key: 'Digit1', code: 'Digit1' });
key(active() ?? document.body, { key: 'Digit3', code: 'Digit3' });
check('digits toggle multi-select choices', multi.buttons[0].getAttribute('aria-checked') === 'true' && multi.buttons[2].getAttribute('aria-checked') === 'true');
key(active() ?? document.body, { key: 'Digit1', code: 'Digit1' });
check('a repeated digit untoggles', multi.buttons[0].getAttribute('aria-checked') === 'false');
multi.card.remove();

/* ------------------------------------------------------------------ 4. approval ------------- */

console.log('approval card: Enter answers and hands the caret back');
const composer = document.createElement('textarea');
document.body.appendChild(composer);
const approval = buildApprovalCard();
document.body.appendChild(approval.card);
// Self-test the mock: a dispatch into the card while its button has focus must count.
approval.card.querySelector('button').focus();
approval.card.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
check('the approval mock counts a direct dispatch', approval.seen.allow === 1, `allow=${approval.seen.allow}`);
approval.seen.allow = 0;
composer.focus();
key(active() ?? document.body, { key: 'Enter', code: 'Enter' });
await tick(60);
check('Enter with the caret in the composer approves', approval.seen.allow === 1, `allow=${approval.seen.allow}`);
check('the caret returns to the composer', active() === composer, `active=${active()?.tagName ?? 'none'}`);

const approval2 = buildApprovalCard('a2');
document.body.appendChild(approval2.card);
composer.focus();
approval2.card.querySelector('button').focus();
key(active() ?? document.body, { key: 'Escape', code: 'Escape' });
await tick(60);
check('Escape with focus already inside the card rejects', approval2.seen.reject === 1, `reject=${approval2.seen.reject}`);
check('the caret still returns to the composer', active() === composer, `active=${active()?.tagName ?? 'none'}`);
approval.card.remove();
approval2.card.remove();

/* ------------------------------------------------------------------ 5. pane scrolling -------- */

console.log('scrolling: plain arrows scroll the pane under the pointer');
const pane = makeScrollable(document.createElement('div'), { top: 0, clientHeight: 200, scrollHeight: 2000 });
document.body.appendChild(pane);
pointerTarget = pane;
window.dispatchEvent(new window.MouseEvent('pointermove', { clientX: 10, clientY: 10, bubbles: true }));
key(active() ?? document.body, { key: 'ArrowDown', code: 'ArrowDown' });
await tick(120);
keyUp(document.body, { key: 'ArrowDown', code: 'ArrowDown' });
const scrolled = pane.scrollTop;
await tick(80);
check('ArrowDown scrolls the pane the pointer is over', scrolled > 0, `scrollTop=${scrolled}`);
check('releasing the key stops the scroll', pane.scrollTop === scrolled, `scrollTop=${pane.scrollTop}`);

const multiline = document.createElement('textarea');
multiline.value = 'line one\nline two\nline three';
document.body.appendChild(multiline);
multiline.focus();
multiline.setSelectionRange(9, 9); // caret on the middle line: the field owns the key
const before = pane.scrollTop;
const held = key(multiline, { key: 'ArrowDown', code: 'ArrowDown' });
await tick(60);
check('a multiline field keeps the caret key', !held.defaultPrevented && pane.scrollTop === before, `prevented=${held.defaultPrevented} scrollTop=${pane.scrollTop}`);
multiline.setSelectionRange(multiline.value.length, multiline.value.length); // caret at the end
const atEnd = key(multiline, { key: 'ArrowDown', code: 'ArrowDown' });
await tick(120);
keyUp(multiline, { key: 'ArrowDown', code: 'ArrowDown' });
check('at the end of the text the arrow is consumed for scrolling', atEnd.defaultPrevented, `prevented=${atEnd.defaultPrevented}`);

/* ------------------------------------------------------------------ result ------------------ */

console.error = realConsole.error;
console.warn = realConsole.warn;
console.log('');
if (noise.length > 0) {
  console.log(`-- ${noise.length} runtime message(s) --`);
  for (const message of noise.slice(0, 10)) console.log(`  ${message}`);
  console.log('');
}
if (failures.length > 0) {
  console.error(`FAIL: ${failures.length} of ${failures.length + passed} interaction checks failed`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`PASS: ${passed} DOM interaction checks passed`);
