/**
 * Record what happens to keys typed into a real question card — unconditionally.
 * Every keydown is logged with its target, whether anything cancelled it, and where the focus was;
 * any field that appears is dumped too. Nothing here relies on knowing the card's own markup.
 */
import { chromium } from 'playwright';
const url = process.argv[2];
const seconds = Number(process.argv[3] ?? '150');
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.addInitScript(() => {
  if (typeof Promise.withResolvers !== 'function') {
    Promise.withResolvers = () => { let resolve; let reject; const promise = new Promise((res, rej) => { resolve = res; reject = rej; }); return { promise, resolve, reject }; };
  }
  if (typeof AbortSignal.any !== 'function') {
    AbortSignal.any = (signals) => { const c = new AbortController(); const a = () => c.abort(); for (const s of signals) { if (s.aborted) { a(); break; } s.addEventListener('abort', a, { once: true }); } return c.signal; };
  }
  const describe = (node) => {
    if (node === null || node === undefined) return 'none';
    const role = node.getAttribute?.('role');
    const marker = node.getAttribute?.('data-question-key') !== null ? '[q]'
      : node.getAttribute?.('data-approval-key') !== null ? '[a]'
        : node.getAttribute?.('data-plan-review-key') !== null ? '[p]' : '';
    return `${node.tagName ?? '?'}${marker}${role ? `[role=${role}]` : ''}${node.isContentEditable ? '[editable]' : ''}`;
  };
  window.__keyLog = [];
  window.addEventListener('keydown', (event) => {
    const entry = { code: event.code, key: event.key, target: describe(event.target), active: describe(document.activeElement), prevented: null };
    window.__keyLog.push(entry);
    // Bubble phase, on window: by now every other handler has run.
    window.addEventListener('keydown', (same) => {
      if (same === event) entry.prevented = same.defaultPrevented;
    }, { once: true, capture: false });
  }, true);
  window.__fields = [];
  const noteFields = () => {
    for (const node of document.querySelectorAll('input, textarea, [contenteditable="true"]')) {
      const label = `${describe(node)}:${node.getAttribute?.('placeholder') ?? ''}`;
      if (window.__fields.includes(label) !== true) window.__fields.push(label);
    }
  };
  window.setInterval(noteFields, 500);
});
try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__sessionCards !== undefined, undefined, { timeout: 60000 });
  console.log('READY');
  await page.waitForTimeout(seconds * 1000);
  const out = await page.evaluate(() => ({ keys: window.__keyLog.slice(-60), fields: window.__fields.slice(-20) }));
  console.log('FIELDS', JSON.stringify(out.fields));
  for (const entry of out.keys) {
    console.log('KEY', entry.code, 'key=' + JSON.stringify(entry.key), 'target=' + entry.target, 'active=' + entry.active, 'prevented=' + entry.prevented);
  }
} finally {
  await browser.close();
}
