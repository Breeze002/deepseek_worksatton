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
function buildQuestionCard({ key = 'q1', questions, clientHeight = 120, optionHeight = 40, gap = 4, nav = false }) {
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
      if (question.descriptions === true) {
        // The shell puts a small copy/expand toggle inside the same option row.
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-label', `${label} details`);
        toggle.textContent = 'v';
        row.appendChild(toggle);
      }
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
  let navigation = null;
  if (nav === true) {
    // The shell renders its own 上一题 / 下一题 controls; the labels come from its dictionaries.
    const footer = document.createElement('div');
    const prev = document.createElement('button');
    prev.type = 'button';
    prev.textContent = '上一题';
    const next = document.createElement('button');
    next.type = 'button';
    next.textContent = '下一题';
    const seen = { prev: 0, next: 0 };
    prev.addEventListener('click', () => {
      seen.prev += 1;
    });
    next.addEventListener('click', () => {
      seen.next += 1;
    });
    footer.append(prev, next);
    card.appendChild(footer);
    navigation = { prev, next, seen };
  }
  return { card, scroller, buttons, fields, wrappers, nav: navigation };
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
      chatSessionId: 'session-chat',
      createdAt: 0,
      members: [
        { id: 'm1', sessionId: 'session-aaa', alias: 'alpha', title: 'first', cwd: '/tmp/a' },
        { id: 'm2', sessionId: 'session-bbb', alias: 'beta', title: 'second', cwd: '/tmp/b' },
      ],
    },
  ],
};

const registered = [];
// Every key this plugin published through the inspection marker, in order (the real slot keeps only
// the latest occupant, so assertions read this log instead).
const publishedKeys = [];
const opened = [];
const commands = [];

// The shell's session store: apply() subscribes to it and mirrors it into the plugin's own store,
// then the member rows, the conversation strip and the row alias read that.
let sessionIndex = {
  'session-aaa': { id: 'session-aaa', retainedBy: { mainView: 1 }, running: true },
  'session-bbb': { id: 'session-bbb', pendingInteraction: 'question' },
};
// The chat engine's view of a member Session: prompt delivery plus an event stream to mirror.
const prompts = [];
const cancels = [];
const chatStreams = new Map();
const sessionsService = {
  list: null,
  retain: (sessionId) => {
    const listeners = new Set();
    let window = { entries: [], hasMore: false, revision: 0, change: { kind: 'append', entries: [] } };
    chatStreams.set(sessionId, {
      emit: (event) => {
        const entry = { type: 'event', event };
        window = {
          ...window,
          entries: [...window.entries, entry],
          revision: window.revision + 1,
          change: { kind: 'append', entries: [entry] },
        };
        for (const listener of listeners) listener();
      },
    });
    return {
      sessionId,
      ready: Promise.resolve(),
      release: () => {},
      binding: {
        session: {
          prompt: async (content, mode) => {
            prompts.push({ sessionId, mode, text: content.map((part) => part.text ?? '').join('') });
            return { ok: true, value: { accepted: true } };
          },
          cancel: async () => {
            cancels.push(sessionId);
            return { ok: true, value: { accepted: true } };
          },
        },
        eventSource: {
          subscribe: (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
          },
          getSnapshot: () => window,
        },
      },
    };
  },
};
const sessionListListeners = new Set();
let sessionSnapshot = { byId: sessionIndex };
const sessionListStore = {
  getSnapshot: () => sessionSnapshot,
  subscribe: (listener) => {
    sessionListListeners.add(listener);
    return () => sessionListListeners.delete(listener);
  },
};
sessionsService.list = sessionListStore;

const publishSessions = (next) => {
  sessionIndex = next;
  sessionSnapshot = { byId: next }; // a new object per change, as the real store does
  for (const listener of sessionListListeners) listener();
};

const context = {
  slots: {
    inject: (name, installer) => {
      installer();
      return () => {};
    },
    register: (options, component) => {
      // Faithful to the real slot API: the disposer withdraws the contribution.
      const entry = { name: options?.name, options, component };
      registered.push(entry);
      if (options?.name === 'contextMenu.content') publishedKeys.push(String(options?.key));
      return () => {
        const index = registered.indexOf(entry);
        if (index >= 0) registered.splice(index, 1);
      };
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
      chatSession: async () => ({ ok: true, value: 'session-chat' }),
      execute: async (command) => {
        commands.push(command);
        return { ok: true, value: BOARD };
      },
    },
  },
  effect: (callback) => {
    const disposer = callback();
    return typeof disposer === 'function' ? disposer : () => {};
  },
  get: (name) => {
    if (name === 'sessions') return sessionsService;
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
  useSessions: (selector) => selector({ byId: sessionIndex }),
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
const lastTrace = () => String([...publishedKeys].reverse().find((key) => key.startsWith('sessionCardsTrace=')) ?? '')
  .replace('sessionCardsTrace=', '');

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
// Entering the board puts the cursor on the control at the top, not inside the member list.
const topControl = panel.querySelector('.dsc-head button');
check('entering the board focuses the top control', active() === topControl, `active=${active()?.textContent ?? 'none'}`);
panel.focus();
// The ring: header controls, group chips, then one stop per member row.
const functional = [panel.querySelector('.dsc-head'), panel.querySelector('.dsc-groups')]
  .filter((scope) => scope !== null)
  .flatMap((scope) => [...scope.querySelectorAll('button')]);
const controls = functional;
const isChatRow = (row) => row.textContent.includes('groupChat');
const memberRowButtons = [...panel.querySelectorAll('.dsc-row')].filter((row) => !isChatRow(row)).map((row) => row.querySelector('.dsc-row-main'));
const rowActions = [...panel.querySelectorAll('.dsc-row .dsc-icon-btn')];
check('board exposes its functional buttons', controls.length >= 4, `found ${controls.length}`);
check('the board has member rows too', memberRowButtons.length >= 1, `found ${memberRowButtons.length}`);
const arrowsPrevented = key(panel, { key: 'ArrowDown', code: 'ArrowDown' });
check('ArrowDown moves focus to the first control', active() === controls[0], `active=${active()?.tagName ?? 'none'}`);
check('ArrowDown prevents the page from scrolling', arrowsPrevented.defaultPrevented);
key(active(), { key: 'ArrowDown', code: 'ArrowDown' });
check('ArrowDown advances to the next control', active() === controls[1], `active=${active()?.tagName ?? 'none'}`);
key(active(), { key: 'End', code: 'End' });
check('End stops on the last member row', active() === memberRowButtons[memberRowButtons.length - 1], `active=${active()?.className ?? 'none'}`);
key(active(), { key: 'Home', code: 'Home' });
check('Home jumps back to the first control', active() === controls[0]);
// Up/down walk places — the header controls, the chips and one stop per member row.
const walked = [];
for (let hop = 0; hop < controls.length + memberRowButtons.length + 2; hop += 1) {
  key(active(), { key: 'ArrowDown', code: 'ArrowDown' });
  walked.push(active());
}
check('up/down reach the member rows', memberRowButtons.some((button) => walked.includes(button)));
check('up/down never land inside a row', rowActions.every((button) => !walked.includes(button)), `actions=${rowActions.length}`);
check('and the walk wraps back to the top', walked.includes(controls[0]));
// Left/right step into and out of that row's own buttons.
const ringRow = memberRowButtons[0];
const ringRowActions = [...ringRow.closest('.dsc-row').querySelectorAll('.dsc-icon-btn:not([disabled])')];
await React.act(async () => {
  ringRow.focus();
});
key(ringRow, { key: 'ArrowRight', code: 'ArrowRight' });
check('right steps into the row buttons', active() === ringRowActions[0], `active=${active()?.getAttribute?.('title') ?? 'none'}`);
key(active(), { key: 'ArrowRight', code: 'ArrowRight' });
check('right steps along them', active() === ringRowActions[1], `active=${active()?.getAttribute?.('title') ?? 'none'}`);
key(active(), { key: 'ArrowLeft', code: 'ArrowLeft' });
check('left steps back', active() === ringRowActions[0]);
key(active(), { key: 'ArrowLeft', code: 'ArrowLeft' });
check('and left again returns to the row itself', active() === ringRow);
key(ringRow, { key: 'ArrowDown', code: 'ArrowDown' });
check('down from a row moves to the next row, not inside it', active() === memberRowButtons[1], `active=${active()?.className ?? 'none'}`);
await React.act(async () => {
  memberRowButtons[0].focus();
});
const rowEnter = key(memberRowButtons[0], { key: 'Enter', code: 'Enter' });
check('Enter on a member row is left to the row itself', !rowEnter.defaultPrevented);
await React.act(async () => {
  memberRowButtons[0].click();
});
check('activating a row selects that member', memberRowButtons[0]?.closest('.dsc-row')?.classList.contains('is-active') === true);
key(active(), { key: 'Home', code: 'Home' });
const enterEvent = key(active(), { key: 'Enter', code: 'Enter' });
check('Enter is left to the control (not swallowed)', !enterEvent.defaultPrevented);
const addButton = controls.find((button) => (button.textContent ?? '').includes('addMember'));
await React.act(async () => {
  addButton?.click();
});
check('clicking a board button opens its dialog', boardHost.querySelector('.dsc-modal') !== null);
await React.act(async () => {
  boardHost.querySelector('.dsc-modal')?.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
});

console.log('board: members can be reordered, which changes the Alt+1…9 mapping');
const firstRow = [...boardHost.querySelectorAll('.dsc-row')].filter((row) => !row.textContent.includes('groupChat'))[0];
check('rows offer move controls', firstRow?.querySelector('button[title="moveDown"]') !== null);
await React.act(async () => {
  firstRow?.querySelector('button[title="moveDown"]')?.click();
});
const move = commands.at(-1);
check(
  'the move-down control asks the host to reorder that member',
  move?.action === 'moveMember' && move?.memberId === 'm1' && move?.toIndex === 1,
  JSON.stringify(move),
);
check('the first row cannot move up', firstRow?.querySelector('button[title="moveUp"]')?.disabled === true);

console.log('board: member rows show what each member is doing');
const rowOf = (alias) => [...panel.querySelectorAll('.dsc-row')].find((row) => row.textContent.includes(alias));
const badgeOf = (alias) => rowOf(alias)?.querySelector('.dsc-badge');
check('a running member shows the running dot', badgeOf('alpha')?.classList.contains('is-running') === true, badgeOf('alpha')?.className);
check('with its label', rowOf('alpha')?.textContent.includes('statusRunning') === true, rowOf('alpha')?.textContent);
check('a member waiting on you shows the warning dot', badgeOf('beta')?.classList.contains('is-waiting') === true, badgeOf('beta')?.className);
check('with its label', rowOf('beta')?.textContent.includes('statusWaiting') === true, rowOf('beta')?.textContent);
check('nothing is marked unread while you are just watching', badgeOf('alpha')?.querySelector('.dsc-unread') === null && badgeOf('beta')?.querySelector('.dsc-unread') === null);

console.log('board: a member that finished while you looked elsewhere is marked');
await React.act(async () => {
  publishSessions({
    'session-aaa': { id: 'session-aaa', retainedBy: { mainView: 1 }, running: true },
    'session-bbb': { id: 'session-bbb', completed: true },
  });
});
check('the finished member shows the done dot', badgeOf('beta')?.classList.contains('is-done') === true, badgeOf('beta')?.className);
check('and an unread mark', badgeOf('beta')?.querySelector('.dsc-unread') !== null);
check('the busy one is left alone', badgeOf('alpha')?.querySelector('.dsc-unread') === null);
const betaRow = rowOf('beta');
await React.act(async () => {
  betaRow.querySelector('.dsc-row-main').click();
});
check('selecting the finished member clears the mark', badgeOf('beta')?.querySelector('.dsc-unread') === null);
await React.act(async () => {
  boardRoot.render(React.createElement(boardEntry.component, slotProps));
});
check('and it does not come back on the next update', badgeOf('beta')?.querySelector('.dsc-unread') === null);

console.log('board: an idle member is shown as idle');
await React.act(async () => {
  publishSessions({ 'session-aaa': { id: 'session-aaa', retainedBy: { mainView: 1 }, running: true } });
});
check('a member with no shell session reads idle', badgeOf('beta')?.classList.contains('is-idle') === true, badgeOf('beta')?.className);
check('and says so', rowOf('beta')?.textContent.includes('idle') === true, rowOf('beta')?.textContent);

console.log('status: the member keys follow the visible session');
const iconEntry = registered.find((entry) => entry.name === 'sidebar.panellist');
const iconHost = document.createElement('div');
document.body.appendChild(iconHost);
const iconRoot = createRoot(iconHost);
const iconProps = { size: 18, active: false, useSessions: (selector) => selector({ byId: sessionIndex }) };
const lastFollow = () => [...publishedKeys].reverse().find((key) => key.startsWith('sessionCardsFollow=')) ?? '';
// Outside the group first, then a member session: each step is a real change, so the wiring runs.
await React.act(async () => {
  publishSessions({ 'session-zzz': { id: 'session-zzz', retainedBy: { mainView: 1 } } });
});
check('a session outside the group turns the member keys off', lastFollow().includes('member=none') && lastFollow().includes('keys-off'), lastFollow());
await React.act(async () => {
  publishSessions({ 'session-aaa': { id: 'session-aaa', retainedBy: { mainView: 1 }, running: true } });
});
check('entering a member session turns the member keys on', lastFollow().includes('member=alpha') && lastFollow().includes('keys-on'), lastFollow());

console.log('sidebar: a member session covers the browsing region with the member list');
// The shell's browsing region, found by the readable part of its (hashed) class.
const region = document.createElement('div');
region.className = 'Mbwy4a_regionArea';
region.getBoundingClientRect = () => ({ left: 12, top: 40, width: 240, height: 500, right: 252, bottom: 540 });
document.body.appendChild(region);
const panelRootHost = document.createElement('div');
document.body.appendChild(panelRootHost);
const panelRoot = createRoot(panelRootHost);
await React.act(async () => {
  publishSessions({
    'session-aaa': { id: 'session-aaa', retainedBy: { mainView: 1 }, running: true },
    'session-bbb': { id: 'session-bbb', pendingInteraction: 'question' },
  });
});
await React.act(async () => {
  panelRoot.render(React.createElement(iconEntry.component, iconProps));
});
const cover = panelRootHost.querySelector('.dsc-member-panel');
check('entering a member session covers the region', cover !== null);
check(
  'the cover follows the sidebar column',
  cover !== null && cover.style.left === '12px' && cover.style.width === '240px',
  cover === null ? 'no panel' : `${cover.style.left} ${cover.style.width}`,
);
const coverMemberRows = cover === null ? [] : [...cover.querySelectorAll('.dsc-row')].filter((row) => !row.textContent.includes('groupChat'));
check('and lists every member', coverMemberRows.length === 2, String(coverMemberRows.length));
check('with their run status', cover !== null && cover.querySelectorAll('.dsc-badge.is-running').length === 1);
check('and a switch back to the shipped session list', cover !== null && cover.querySelector('.dsc-mp-switch') !== null);
await React.act(async () => {
  cover?.querySelector('.dsc-mp-switch')?.click();
});
check('the switch reveals the shipped list again', panelRootHost.querySelector('.dsc-member-panel') === null);
await React.act(async () => {
  publishSessions({ 'session-zzz': { id: 'session-zzz', retainedBy: { mainView: 1 } } });
});
check('a session outside the group leaves the region alone', panelRootHost.querySelector('.dsc-member-panel') === null);
region.remove();

console.log('sidebar: the cover spans the whole sidebar column');
// The previous block removed its region element, so the seam is exercised again here.
const regionAgain = document.createElement('div');
regionAgain.className = 'Mbwy4a_regionArea';
regionAgain.getBoundingClientRect = () => ({ left: 12, top: 40, width: 240, height: 500, right: 252, bottom: 540 });
document.body.appendChild(regionAgain);
await React.act(async () => {
  publishSessions({ 'session-aaa': { id: 'session-aaa', retainedBy: { mainView: 1 }, running: true } });
});
await React.act(async () => {
  panelRoot.render(React.createElement(iconEntry.component, iconProps));
});
const wideCover = panelRootHost.querySelector('.dsc-member-panel');
check(
  'the cover starts at the very top of the sidebar',
  wideCover !== null && wideCover.style.top === '0px' && wideCover.style.height === `${window.innerHeight}px`,
  wideCover === null ? 'none' : `${wideCover.style.top} ${wideCover.style.height}`,
);
check('and keeps the sidebar column width', wideCover !== null && wideCover.style.left === '12px' && wideCover.style.width === '240px');
regionAgain.remove();

console.log('reading: each conversation remembers where the reader was');
/** A fake conversation scroller: real geometry, counted writes to scrollTop. */
const makeScroller = () => {
  const node = document.createElement('div');
  node.style.overflowY = 'auto';
  let top = 0;
  let writes = 0;
  let height = 4000;
  Object.defineProperty(node, 'scrollHeight', { get: () => height });
  Object.defineProperty(node, 'clientHeight', { get: () => 800 });
  Object.defineProperty(node, 'scrollTop', {
    get: () => top,
    set: (value) => {
      writes += 1;
      top = value;
    },
  });
  node.writes = () => writes;
  node.grow = (extra) => {
    height += extra;
  };
  document.body.appendChild(node);
  return node;
};
// The header anchor plus a wide scroller below it: the only shape the plugin will accept.
const readingAnchor = document.createElement('span');
readingAnchor.className = 'dsc-reading-anchor';
readingAnchor.getBoundingClientRect = () => ({ left: 300, top: 40, width: 10, height: 10, right: 310, bottom: 50 });
document.body.appendChild(readingAnchor);
const scroller = makeScroller();
scroller.getBoundingClientRect = () => ({ left: 300, top: 120, width: 800, height: 800, right: 1100, bottom: 920 });
await React.act(async () => {
  publishSessions({ 'session-aaa': { id: 'session-aaa', retainedBy: { mainView: 1 }, running: true } });
});
await tick(40);
scroller.scrollTop = 120; // the reader stops mid-answer
scroller.dispatchEvent(new window.Event('scroll', { bubbles: true }));
await tick(40);
const writesAfterReading = scroller.writes();
scroller.grow(200); // the answer streams in...
scroller.scrollTop = 3400; // ...and the shell pulls the view to the newest output
document.body.appendChild(document.createElement('div'));
await tick(90);
check('the remembered place survives streaming output', scroller.scrollTop === 120, `scrollTop=${scroller.scrollTop}`);
check('and the plugin is the one holding it', scroller.writes() > writesAfterReading + 1, `writes=${scroller.writes()}`);
scroller.scrollTop = scroller.scrollHeight - scroller.clientHeight; // the reader returns to the bottom
scroller.dispatchEvent(new window.Event('scroll', { bubbles: true }));
await tick(40);
const writesAtBottom = scroller.writes();
scroller.grow(200);
document.body.appendChild(document.createElement('div'));
await tick(90);
check('at the bottom the shell keeps control (no writes from us)', scroller.writes() === writesAtBottom, `writes=${scroller.writes()}`);
scroller.scrollTop = 200; // reading again, then switching away
scroller.dispatchEvent(new window.Event('scroll', { bubbles: true }));
await tick(40);
await React.act(async () => {
  publishSessions({ 'session-zzz': { id: 'session-zzz', retainedBy: { mainView: 1 } } });
});
await tick(40);
scroller.scrollTop = 3400; // the other session opens at its own bottom
await React.act(async () => {
  publishSessions({ 'session-aaa': { id: 'session-aaa', retainedBy: { mainView: 1 }, running: true } });
});
await tick(140);
check('coming back to the session restores the place', scroller.scrollTop === 200, `scrollTop=${scroller.scrollTop}`);

console.log('reading: sending a message keeps the view at the start of the reply');
// The reader takes over with a gesture and its scroll: that clears the remembered place, which is
// what "composing at the bottom" means.
document.dispatchEvent(new window.Event('wheel', { bubbles: true }));
scroller.scrollTop = scroller.scrollHeight - scroller.clientHeight;
scroller.dispatchEvent(new window.Event('scroll', { bubbles: true }));
await tick(60);
const composingAt = scroller.scrollTop;
const draftField = document.createElement('textarea');
document.body.appendChild(draftField);
draftField.value = 'a question for the member';
draftField.dispatchEvent(new window.Event('input', { bubbles: true }));
await tick(20);
draftField.value = ''; // the shell took the draft and sent it
draftField.dispatchEvent(new window.Event('input', { bubbles: true }));
await tick(40);
const writesAfterSend = scroller.writes();
scroller.grow(400); // the answer streams in
scroller.scrollTop = scroller.scrollHeight - scroller.clientHeight; // the shell follows the newest output
document.body.appendChild(document.createElement('div'));
await tick(90);
check('the view stays at the start of the reply', scroller.scrollTop === composingAt, `scrollTop=${scroller.scrollTop} expected=${composingAt}`);
check('and the plugin is holding it there', scroller.writes() > writesAfterSend + 1, `writes=${scroller.writes()}`);
// Scrolling gestures and the shell's follow-on-growth are verified in a real browser by
// `npm run verify:visual` (see "reading memory: real scrolling in a real browser"): jsdom fires no
// wheel and never grows a scroller, so driving them here only raced the observer.

scroller.remove();
readingAnchor.remove();

// The Enter fallback trigger (the shell may clear the draft without firing `input`) cannot be driven
// here: jsdom has no scrolling, so a manual scrollTop races the observer. It is checked in the real
// GUI through the plugin's own `sessionCardsReading=` diagnostic instead.

// Scrolling behaviour (the pin following the reader, the bottom handing control back) is verified
// in a real browser by `npm run verify:visual`: jsdom has no scrolling, so driving it here only ever
// raced the observer.

console.log('member panel: the group chat keeps the member list visible');
const chatRegion = document.createElement('div');
chatRegion.className = 'Mbwy4a_regionArea';
chatRegion.getBoundingClientRect = () => ({ left: 12, top: 40, width: 240, height: 500, right: 252, bottom: 540 });
document.body.appendChild(chatRegion);
await React.act(async () => {
  publishSessions({ 'session-chat': { id: 'session-chat', retainedBy: { mainView: 1 } } });
});
await tick(60);
await React.act(async () => {
  panelRoot.render(React.createElement(iconEntry.component, iconProps));
});
await tick(60);
const chatCover = panelRootHost.querySelector('.dsc-member-panel');
check('the cover stays open while the group chat is showing', chatCover !== null, chatCover === null ? 'no cover' : '');
check(
  'and the group chat row is the active one',
  chatCover?.querySelector('.dsc-row.is-active')?.textContent.includes('groupChat') === true,
  chatCover?.querySelector('.dsc-row.is-active')?.textContent ?? 'none',
);
chatRegion.remove();

console.log('status: the shell session rows say which member a session is');
const aliasEntry = registered.find((entry) => entry.name === 'sidebar.session.row.trailing');
const aliasHost = document.createElement('div');
document.body.appendChild(aliasHost);
const aliasRoot = createRoot(aliasHost);
await React.act(async () => {
  aliasRoot.render(React.createElement(aliasEntry.component, { sessionId: 'session-aaa' }));
});
check('a member session is tagged with its alias', aliasHost.textContent === '@alpha', aliasHost.textContent);
await React.act(async () => {
  aliasRoot.render(React.createElement(aliasEntry.component, { sessionId: 'session-zzz' }));
});
check('a session outside the group is not tagged', aliasHost.textContent === '', aliasHost.textContent);

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
await tick(40);
const ring = document.querySelector('.dsc-card-ring');
check('the cursor is painted by our own overlay ring', ring !== null && ring.style.display === 'block', `ring=${ring === null ? 'none' : ring.style.display}`);
const ringBox = preset.buttons[1].getBoundingClientRect();
check(
  'the ring sits over the cursor item and follows it',
  ring !== null && ring.style.left === `${ringBox.left - 2}px` && ring.style.top === `${ringBox.top - 2}px`,
  `ring=${ring?.style.left},${ring?.style.top} target=${ringBox.left},${ringBox.top}`,
);
check('the visible cursor moved with it', preset.buttons[1].classList.contains('dsc-card-cursor') && !preset.buttons[0].classList.contains('dsc-card-cursor'));
const beforeLeftRight = [active(), preset.buttons.map((button) => button.getAttribute('aria-checked')).join()];
key(active() ?? document.body, { key: 'ArrowRight', code: 'ArrowRight' });
key(active() ?? document.body, { key: 'ArrowLeft', code: 'ArrowLeft' });
check(
  'left/right do nothing when the card has a single question',
  active() === beforeLeftRight[0] && preset.buttons.map((button) => button.getAttribute('aria-checked')).join() === beforeLeftRight[1],
);
preset.card.remove();

console.log('question card: option rows with extra icon buttons still work');
const described = buildQuestionCard({ key: 'q12', questions: [{ options: ['d1', 'd2'], descriptions: true }, { options: ['e1'], descriptions: true }] });
document.body.appendChild(described.card);
key(active() ?? document.body, { key: 'ArrowDown', code: 'ArrowDown' });
check('the cursor lands on the choice, not on the row icon', described.buttons[0].classList.contains('dsc-card-cursor'));
key(active() ?? document.body, { key: 'ArrowDown', code: 'ArrowDown' });
check('and steps to the next choice only', described.buttons[1].classList.contains('dsc-card-cursor'), `marked=${[...described.card.querySelectorAll('.dsc-card-cursor')].map((node) => node.textContent).join()}`);
key(active() ?? document.body, { key: 'ArrowRight', code: 'ArrowRight' });
check('right pages to the next answerable question', described.buttons[2].classList.contains('dsc-card-cursor'), `active=${active()?.textContent ?? 'none'}`);
described.card.remove();

console.log('question card: left/right drive the shell own question navigation');
const navCard = buildQuestionCard({ key: 'q15', questions: [{ options: ['n1', 'n2'] }], nav: true });
document.body.appendChild(navCard.card);
key(active() ?? document.body, { key: 'ArrowRight', code: 'ArrowRight' });
check('right clicks the shell next-question control', navCard.nav?.seen.next === 1, JSON.stringify(navCard.nav?.seen));
key(active() ?? document.body, { key: 'ArrowLeft', code: 'ArrowLeft' });
check('left clicks the shell previous-question control', navCard.nav?.seen.prev === 1, JSON.stringify(navCard.nav?.seen));
key(active() ?? document.body, { key: 'ArrowDown', code: 'ArrowDown' });
check('the arrows still move inside the question', navCard.buttons[0].classList.contains('dsc-card-cursor'));
navCard.card.remove();

console.log('question card: the shell only reveals the current question');
const flow = buildQuestionCard({ key: 'q14', questions: [{ options: ['f1', 'f2'] }, { options: ['s1', 's2'] }] });
const flowGroups = [...flow.card.querySelectorAll('[role="radiogroup"], [role="group"]')];
flowGroups[1].hidden = true; // a flow layout hides everything but the question in focus
document.body.appendChild(flow.card);
key(active() ?? document.body, { key: 'ArrowDown', code: 'ArrowDown' });
check('the revealed question takes the cursor', flow.buttons[0].classList.contains('dsc-card-cursor'));
const shapeKey = [...publishedKeys].reverse().find((key) => key.startsWith('sessionCardsShape=')) ?? '';
check('both questions are counted even while one is hidden', shapeKey.includes('b2'), shapeKey);
key(active() ?? document.body, { key: 'ArrowRight', code: 'ArrowRight' });
check(
  'right still moves to the hidden question instead of doing nothing',
  flow.wrappers[1].classList.contains('dsc-card-cursor'),
  `marked=${[...flow.card.querySelectorAll('.dsc-card-cursor')].map((node) => node.tagName).join()}`,
);
flowGroups[1].hidden = false; // the shell then reveals it
key(active() ?? document.body, { key: 'ArrowDown', code: 'ArrowDown' });
check('once revealed, the arrows work inside it', flow.buttons[2].classList.contains('dsc-card-cursor') || flow.buttons[3].classList.contains('dsc-card-cursor'));
flow.card.remove();

console.log('question card: paging skips questions the shell has not rendered');
const gapped = buildQuestionCard({ key: 'q13', questions: [{ options: ['g1'] }, { options: [] }, { options: ['h1', 'h2'] }] });
document.body.appendChild(gapped.card);
key(active() ?? document.body, { key: 'ArrowDown', code: 'ArrowDown' });
check('the cursor starts on the first question', gapped.buttons[0].classList.contains('dsc-card-cursor'));
key(active() ?? document.body, { key: 'ArrowRight', code: 'ArrowRight' });
check('right jumps over the empty one to the next answerable question', gapped.buttons[1].classList.contains('dsc-card-cursor'), `marked=${[...gapped.card.querySelectorAll('.dsc-card-cursor')].map((node) => node.textContent).join()}`);
key(active() ?? document.body, { key: 'ArrowLeft', code: 'ArrowLeft' });
check('left comes back to the answerable question', gapped.buttons[0].classList.contains('dsc-card-cursor'));
gapped.card.remove();

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

console.log('reading: keyboard scrolling counts as a reader gesture');
await tick(200); // let the diagnostic throttle lapse, so this gesture reports its own entry
const gesturesBefore = publishedKeys.filter((key) => key.includes('sessionCardsReading=gesture')).length;
pointerTarget = pane;
document.activeElement?.blur?.(); // the earlier checks left the caret inside a text field
window.dispatchEvent(new window.MouseEvent('pointermove', { clientX: 10, clientY: 10, bubbles: true }));
keyUp(document.body, { key: 'ArrowUp', code: 'ArrowUp' });
const paneBefore = pane.scrollTop;
key(document.body, { key: 'ArrowDown', code: 'ArrowDown' });
await tick(60);
keyUp(document.body, { key: 'ArrowDown', code: 'ArrowDown' });
const gesturesAfter = publishedKeys.filter((key) => key.includes('sessionCardsReading=gesture')).length;
check('an arrow-key scroll is reported as the reader scrolling', gesturesAfter > gesturesBefore, `gestures=${gesturesAfter - gesturesBefore}`);

console.log('scrolling: a pending card keeps the plain arrows');
const cardPane = makeScrollable(document.createElement('div'), { top: 0, clientHeight: 200, scrollHeight: 2000 });
document.body.appendChild(cardPane);
pointerTarget = cardPane;
window.dispatchEvent(new window.MouseEvent('pointermove', { clientX: 10, clientY: 10, bubbles: true }));
const owningCard = buildQuestionCard({ key: 'q11', questions: [{ options: ['a1', 'a2'] }] });
document.body.appendChild(owningCard.card);
const beforeOwned = cardPane.scrollTop;
key(owningCard.buttons[0], { key: 'ArrowDown', code: 'ArrowDown' });
await tick(80);
keyUp(owningCard.buttons[0], { key: 'ArrowDown', code: 'ArrowDown' });
check('the pending card keeps the arrow instead of scrolling the pane', cardPane.scrollTop === beforeOwned, `scrollTop=${cardPane.scrollTop}`);
check('and the card cursor still moves', owningCard.buttons.some((button) => button.classList.contains('dsc-card-cursor')));
owningCard.card.remove();
cardPane.remove();

/* ------------------------------------------------------------------ 9. group chat ------------ */

console.log('group chat: a member-style row opens an ordinary Session');
const chatRow = [...panel.querySelectorAll('.dsc-row')].find((row) => row.textContent.includes('groupChat'));
check('the member list carries the group chat row', chatRow !== undefined && chatRow !== null);
check('the row advertises the shortcut', chatRow.textContent.includes('Alt+G'));
const openedBefore = opened.length;
await React.act(async () => {
  chatRow.querySelector('.dsc-row-main').click();
});
await tick(80);
check('opening it opens the chat Session in the shell', opened.at(-1) === 'session-chat' && opened.length > openedBefore, JSON.stringify(opened.slice(-2)));
check(
  'and the chat Session is seeded so it is an ordinary conversation',
  prompts.some((entry) => entry.sessionId === 'session-chat'),
  JSON.stringify(prompts.slice(-2)),
);
opened.length = openedBefore;
key(document.body, { key: 'g', code: 'KeyG', altKey: true });
await tick(80);
check('Alt+G opens it too', opened.at(-1) === 'session-chat', JSON.stringify(opened.slice(-1)));

console.log('group chat: @routes to a member and their answer is mirrored');
prompts.length = 0;
cancels.length = 0;
await React.act(async () => {
  chatStreams.get('session-chat').emit({
    type: 'user/message',
    seq: 7,
    time: Date.now(),
    data: { message: [{ type: 'text', text: '@alpha 请看这个' }] },
  });
});
await tick(80);
check(
  'the mention is delivered to that member',
  prompts.at(-1)?.sessionId === 'session-aaa' && prompts.at(-1)?.text === '请看这个',
  JSON.stringify(prompts.at(-1) ?? null),
);
check('and the chat Session own agent is silenced', cancels.includes('session-chat'), JSON.stringify(cancels));
prompts.length = 0;
cancels.length = 0;
await React.act(async () => {
  chatStreams.get('session-aaa').emit({
    type: 'assistant/message',
    seq: 42,
    time: Date.now(),
    data: { message: [{ type: 'text', text: '好的，我来处理' }] },
  });
});
await tick(80);
check(
  'the member answer is written back into the chat Session',
  prompts.at(-1)?.sessionId === 'session-chat' && prompts.at(-1)?.text === '@alpha：好的，我来处理',
  JSON.stringify(prompts.at(-1) ?? null),
);
check('and the chat agent is silenced again', cancels.includes('session-chat'), JSON.stringify(cancels));

console.log('group chat: typing @ offers the members');
await React.act(async () => {
  publishSessions({ 'session-chat': { id: 'session-chat', retainedBy: { mainView: 1 } } });
});
await tick(60);
// The mention list lives in the conversation-header seat, so that seat must be mounted.
const extrasEntry = registered.find((entry) => entry.name === 'conversation.session.header.utilities');
const extrasHost = document.createElement('div');
document.body.appendChild(extrasHost);
const extrasRoot = createRoot(extrasHost);
await React.act(async () => {
  extrasRoot.render(React.createElement(extrasEntry.component));
});
const mentionField = document.createElement('textarea');
mentionField.getBoundingClientRect = () => ({ left: 400, top: 600, width: 600, height: 80, right: 1000, bottom: 680 });
document.body.appendChild(mentionField);
const setField = (value, caret) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  setter.call(mentionField, value);
  mentionField.setSelectionRange(caret ?? value.length, caret ?? value.length);
  mentionField.dispatchEvent(new window.Event('input', { bubbles: true }));
};
await React.act(async () => {
  mentionField.focus();
  setField('@al');
});
await tick(40);
const rows = () => [...document.querySelectorAll('.dsc-mention-row')].map((row) => row.textContent);
check('the mention list appears and filters', rows().length === 1 && rows()[0].includes('@alpha'), JSON.stringify(rows()));
check('and it is placed above the mentionField', document.querySelector('.dsc-mention') !== null);
await React.act(async () => {
  window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
});
await tick(40);
check('choosing writes the alias back into the mentionField', mentionField.value === '@alpha ', JSON.stringify(mentionField.value));
check('and the list closes', document.querySelector('.dsc-mention') === null);
await React.act(async () => {
  setField('@');
});
await tick(40);
check('an empty query lists every member', rows().length === 2, JSON.stringify(rows()));
const firstCursor = document.querySelector('.dsc-mention-row.is-cursor')?.textContent ?? '';
await React.act(async () => {
  window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
});
await tick(30);
const secondCursor = document.querySelector('.dsc-mention-row.is-cursor')?.textContent ?? '';
check('ArrowDown moves the cursor in the list', secondCursor !== firstCursor && secondCursor !== '', `${firstCursor} -> ${secondCursor}`);
await React.act(async () => {
  window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
});
await tick(30);
check('Escape closes the list', document.querySelector('.dsc-mention') === null);
// The shell re-renders its composer while typing, which blurs the field for a moment: the list
// must survive that, and only a click outside closes it.
await React.act(async () => {
  setField('@');
});
await tick(40);
mentionField.blur();
await tick(40);
check('the list survives the composer losing focus', document.querySelector('.dsc-mention') !== null);
await React.act(async () => {
  document.body.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true }));
});
await tick(30);
check('a click outside closes it', document.querySelector('.dsc-mention') === null);
mentionField.remove();
extrasHost.remove();

/* ------------------------------------------------------------------ result ------------------ */

console.error = realConsole.error;
console.warn = realConsole.warn;
console.log('');
if (noise.length > 0) {
  console.log(`-- ${noise.length} runtime message(s) --`);
  for (const message of noise.slice(0, 10)) console.log(`  ${message}`);
  console.log('');
}
const swallowed = noise.filter((message) => message.startsWith('[jsdomError]'));
if (swallowed.length > 0) {
  console.error(`FAIL: ${swallowed.length} exception(s) were swallowed inside event listeners:`);
  for (const message of swallowed.slice(0, 5)) console.error(`  ${message.split('\n')[0]}`);
  process.exit(1);
}
if (failures.length > 0) {
  console.error(`FAIL: ${failures.length} of ${failures.length + passed} interaction checks failed`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`PASS: ${passed} DOM interaction checks passed`);
// The plugin keeps a polling interval alive by design; a test run must still end.
process.exit(0);
