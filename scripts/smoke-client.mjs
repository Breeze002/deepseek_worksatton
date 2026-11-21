#!/usr/bin/env node
/**
 * Local smoke test for the built Client half: evaluate `client.js` under a stubbed module loader
 * and React, then run `apply` against a recording context. It cannot render, but it catches a
 * module-level throw and every wiring throw (slot registration, Remote mount, optional services)
 * without a browser or a restart.
 *
 *   node scripts/smoke-client.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const bundle = readFileSync(resolve(root, 'client.js'), 'utf8');

const registered = [];
const openedSessions = [];
const selectedPanels = [];
const keyHandlers = [];
const provided = [];
const effects = [];
let mounted = null;

const BOARD = {
  formatVersion: 1,
  revision: 1,
  commands: [],
  groups: [
    {
      id: 'g1',
      name: 'smoke group',
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

const fakeReact = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
  Component: class {
    constructor(props) {
      this.props = props ?? {};
      this.state = {};
    }

    setState(next) {
      Object.assign(this.state, typeof next === 'function' ? next(this.state) : next);
    }
  },
  Fragment: Symbol('Fragment'),
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: () => {},
  useRef: () => ({ current: null }),
  useCallback: (fn) => fn,
  useMemo: (fn) => fn(),
  useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
};
fakeReact.default = fakeReact;

// The Client half checks field types by constructor, which the browser provides and Node does not.
globalThis.HTMLTextAreaElement = class HTMLTextAreaElement {};
globalThis.HTMLInputElement = class HTMLInputElement {};
globalThis.HTMLSelectElement = class HTMLSelectElement {};
globalThis.document = {
  activeElement: null,
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: () => {},
  removeEventListener: () => {},
  elementFromPoint: () => null,
  createElement: () => ({ textContent: '', remove: () => {}, classList: { add: () => {}, remove: () => {} } }),
  head: { appendChild: () => {} },
};
globalThis.window = {
  __ModuleLoader__: {
    load: (definition) => {
      mounted = definition;
    },
  },
  addEventListener: (type, handler) => {
    if (type === 'keydown') keyHandlers.push(handler);
  },
  removeEventListener: () => {},
  setTimeout: (callback) => setTimeout(callback, 0),
  clearTimeout: (handle) => clearTimeout(handle),
  requestAnimationFrame: (callback) => setTimeout(() => callback(performance.now()), 0),
  cancelAnimationFrame: (handle) => clearTimeout(handle),
  getComputedStyle: () => ({ overflowY: 'visible' }),
  getSelection: () => null,
  innerWidth: 1200,
  innerHeight: 800,
};

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
  locale: {
    register: (ns, dictionaries) => {
      if (namespaceSeen === undefined) namespaceSeen = ns;
      if (!dictionaries?.zh || !dictionaries?.en) throw new Error('locale: missing dictionaries');
      return () => {};
    },
    bind: () => (key) => key,
    subscribe: () => () => {},
  },
  remote: {
    $mount: async (contribution) => {
      if (contribution?.package !== 'dsh-session-cards') throw new Error('$mount: wrong package');
      if (!Array.isArray(contribution?.descriptors) || contribution.descriptors.length === 0) {
        throw new Error('$mount: no descriptors');
      }
      return () => {};
    },
    sessionCards: {
      snapshot: async () => ({ ok: true, value: BOARD }),
      watch: async () => ({ ok: true, value: { formatVersion: 1, revision: 0, commands: [], groups: [] } }),
      options: async () => ({ ok: true, value: { groups: [] } }),
      execute: async () => ({ ok: true, value: { formatVersion: 1, revision: 1, commands: [], groups: [] } }),
    },
  },
  effect: (callback) => {
    // cordis runs the callback to install the effect and keeps its disposer; a stub that only
    // records it would skip every registration that lives inside an effect (locale, styles).
    effects.push(callback);
    const disposer = callback();
    return typeof disposer === 'function' ? disposer : () => {};
  },
  get: (name) => {
    if (name === 'uiWorkspace') return { openSession: (sessionId) => openedSessions.push(sessionId) };
    if (name === 'layout') return { selectPanel: (panelId) => selectedPanels.push(panelId) };
    return undefined;
  },
  provide: (name, value) => {
    provided.push({ name, value });
  },
  inject: async (_dependencies, callback) => {
    callback(context);
    return () => {};
  },
  logger: { warn: (message) => console.warn('  ctx.logger.warn:', message) },
};

let namespaceSeen;
const require = createRequire(import.meta.url);
const originalRequire = globalThis.require;

// The bundle is a plain script that calls window.__ModuleLoader__.load({id, factory}).
new Function('require', bundle)((specifier) => {
  if (specifier === 'react' || specifier === 'react/jsx-runtime') return fakeReact;
  return originalRequire?.(specifier) ?? require(specifier);
});

if (mounted === null) {
  console.error('FAIL: the bundle never called window.__ModuleLoader__.load');
  process.exit(1);
}
if (mounted.id !== 'dsh-session-cards') {
  console.error(`FAIL: module id is ${JSON.stringify(mounted.id)}`);
  process.exit(1);
}

const exported = mounted.factory((specifier) => {
  if (specifier === 'react' || specifier === 'react/jsx-runtime') return fakeReact;
  throw new Error(`unexpected require: ${specifier}`);
});

if (typeof exported?.apply !== 'function') {
  console.error('FAIL: the factory did not export apply');
  process.exit(1);
}

try {
  await exported.apply(context);
} catch (failure) {
  console.error(`FAIL: apply threw: ${failure instanceof Error ? failure.stack : String(failure)}`);
  process.exit(1);
}

const names = registered.map((entry) => entry.name);
const required = ['main', 'sidebar.panellist', 'contextMenu.content'];
const missing = required.filter((name) => !names.includes(name));
if (missing.length > 0) {
  console.error(`FAIL: missing registrations: ${missing.join(', ')} (saw: ${names.join(', ')})`);
  process.exit(1);
}
if (namespaceSeen !== 'session-cards') {
  console.error(`FAIL: locale namespace is ${JSON.stringify(namespaceSeen)}`);
  process.exit(1);
}
if (!provided.some((entry) => entry.name === 'sessionCards')) {
  console.error('FAIL: the client service was not provided');
  process.exit(1);
}

// The keyboard path end to end: prime() mirrors the board, then Alt+2 must open member 2's session.
await new Promise((done) => setTimeout(done, 0));
if (keyHandlers.length === 0) {
  console.error('FAIL: no keydown listener was installed');
  process.exit(1);
}
const event = {
  altKey: true,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  code: 'Digit2',
  preventDefault: () => {},
  stopPropagation: () => {},
};
for (const handler of keyHandlers) handler(event);
// A switch that also has to enter the group view navigates one tick later, after the shell settles.
await new Promise((done) => setTimeout(done, 10));
if (!openedSessions.includes('session-bbb')) {
  const markers = registered.filter((entry) => entry.name === 'contextMenu.content').map((entry) => entry.options.key);
  console.error(`FAIL: Alt+2 did not open member 2 (opened: ${JSON.stringify(openedSessions)})`);
  console.error(`  markers: ${JSON.stringify(markers.slice(-4))}`);
  console.error(`  key listeners: ${keyHandlers.length}, panels: ${JSON.stringify(selectedPanels)}`);
  process.exit(1);
}

// Back: with no jump history the key returns to the board panel.
for (const handler of keyHandlers) {
  handler({ ...event, code: 'Backquote', shiftKey: false });
}
if (!selectedPanels.includes('session-cards')) {
  console.error(`FAIL: the back key did not return to the board (panels: ${JSON.stringify(selectedPanels)})`);
  process.exit(1);
}

console.log('PASS: client bundle evaluates and wires cleanly');
console.log(`  back key selected: ${selectedPanels.join(', ')}`);
console.log(`  Alt+2 opened:  ${openedSessions.join(', ')}`);
console.log(`  inject:        ${JSON.stringify(exported.inject)}`);
console.log(`  registrations: ${names.join(', ')}`);
console.log(`  provided:      ${provided.map((entry) => entry.name).join(', ')}`);
console.log(`  effects:       ${effects.length}`);

// ---- render phase -----------------------------------------------------------------------------
// Node is the only place this runs before the browser: it catches render-time throws such as a
// `const` read before its declaration, which blank the whole panel without any host log.
const isClass = (type) => typeof type.prototype?.render === 'function';
let evaluated = 0;
const renderNames = [];
function renderNode(node, depth = 0) {
  if (depth > 16 || evaluated > 600) return;
  if (node === null || node === undefined || typeof node === 'boolean') return;
  if (typeof node === 'string' || typeof node === 'number') return;
  if (Array.isArray(node)) {
    for (const child of node) renderNode(child, depth);
    return;
  }
  const { type, props, children } = node;
  if (typeof type === 'function') {
    evaluated += 1;
    renderNames.push(type.name || 'anonymous');
    const args = { ...props, children };
    try {
      renderNode(isClass(type) ? new type(args).render() : type(args), depth + 1);
    } catch (failure) {
      console.error(`FAIL: <${type.name || 'anonymous'}> threw while rendering: ${failure instanceof Error ? failure.message : String(failure)}`);
      if (failure instanceof Error) console.error(String(failure.stack).split('\n').slice(1, 4).join('\n'));
      process.exit(1);
    }
    return;
  }
  renderNode(children, depth + 1);
}

await new Promise((done) => setTimeout(done, 5));
const slotProps = {
  useWorkspaces: (selector) => selector({ items: [{ workspaceId: 'ws-1', title: 'ws', path: '/tmp/ws', sessionIds: ['session-aaa', 'session-bbb'] }] }),
  useSessions: (selector) => selector({ byId: { 'session-aaa': { id: 'session-aaa', retainedBy: { mainView: 1 } } } }),
};
for (const entry of registered) {
  if (typeof entry.component !== 'function') continue;
  const props = entry.name === 'main' ? slotProps : { ...slotProps, wide: true, expandSidebar() {} };
  renderNode(entry.component(props));
}
if (evaluated === 0) {
  console.error('FAIL: no component rendered');
  process.exit(1);
}
console.log(`  rendered:      ${evaluated} components (${[...new Set(renderNames)].slice(0, 8).join(', ')})`);
