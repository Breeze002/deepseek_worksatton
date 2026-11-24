/**
 * Measure the cost of the member panel while a conversation is open.
 * Reports long tasks, frame health and how long switching members takes — the numbers the panel's
 * render cost shows up in.
 */
import { chromium } from 'playwright';
const url = process.argv[2];
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.addInitScript(() => {
  if (typeof Promise.withResolvers !== 'function') {
    Promise.withResolvers = () => { let resolve; let reject; const promise = new Promise((res, rej) => { resolve = res; reject = rej; }); return { promise, resolve, reject }; };
  }
  if (typeof AbortSignal.any !== 'function') {
    AbortSignal.any = (signals) => { const c = new AbortController(); const a = () => c.abort(); for (const s of signals) { if (s.aborted) { a(); break; } s.addEventListener('abort', a, { once: true }); } return c.signal; };
  }
});
const press = (code, key, extra = {}) => page.evaluate(({ c, k, e }) => {
  window.dispatchEvent(new KeyboardEvent('keydown', { code: c, key: k, bubbles: true, ...e }));
}, { c: code, k: key, e: extra });
try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__sessionCards !== undefined, undefined, { timeout: 60000 });
  await page.waitForTimeout(5000);
  await page.evaluate(() => {
    window.__lt = [];
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          const a = (e.attribution ?? [])[0] ?? {};
          window.__lt.push({
            ms: Math.round(e.duration),
            at: Math.round(e.startTime),
            name: a.name ?? '',
            type: a.containerType ?? '',
            src: (a.containerSrc ?? '').slice(-60),
          });
        }
      }).observe({ entryTypes: ['longtask'] });
    } catch { /* unsupported */ }
  });
  // Enter a member conversation: the panel appears and the shell renders a whole transcript.
  const t0 = Date.now();
  await press('Digit1', '1', { altKey: true });
  await page.waitForFunction(() => document.querySelector('.dsc-member-panel') !== null, undefined, { timeout: 30000 });
  const openMs = Date.now() - t0;
  await page.waitForTimeout(2500);
  // Switch to the next member: this is the action that felt slow.
  const t1 = Date.now();
  await press('Digit2', '2', { altKey: true });
  await page.waitForTimeout(1500);
  const switchMs = Date.now() - t1;
  const stats = await page.evaluate(async () => {
    const frames = [];
    let last = performance.now();
    await new Promise((resolve) => {
      const end = performance.now() + 6000;
      const tick = () => { const now = performance.now(); frames.push(now - last); last = now; if (now < end) requestAnimationFrame(tick); else resolve(); };
      requestAnimationFrame(tick);
    });
    const sorted = [...frames].sort((a, b) => a - b);
    return {
      rows: document.querySelectorAll('.dsc-row').length,
      median: Math.round(sorted[Math.floor(sorted.length / 2)] ?? 0),
      worst: Math.round(Math.max(0, ...frames)),
      over50: frames.filter((v) => v > 50).length,
      longTasks: window.__lt.length,
      longWorst: window.__lt.length === 0 ? 0 : Math.max(...window.__lt.map((e) => e.ms)),
      worst: window.__lt.slice().sort((a, b) => b.ms - a.ms).slice(0, 3),
      domNodes: document.querySelectorAll('*').length,
    };
  });
  console.log('RESULT', JSON.stringify({ openMs, switchMs, ...stats }));
} finally {
  await browser.close();
}
