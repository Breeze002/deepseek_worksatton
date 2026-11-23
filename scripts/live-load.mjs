/**
 * Measure how long the GUI takes to become usable, and confirm the plugin's data is on screen.
 * Load time is measured from navigation: shell chrome, then this plugin's board, then frame health.
 */
import { chromium } from 'playwright';
const url = process.argv[2];
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.addInitScript(() => {
  if (typeof Promise.withResolvers !== 'function') {
    Promise.withResolvers = () => {
      let resolve; let reject;
      const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
      return { promise, resolve, reject };
    };
  }
  if (typeof AbortSignal.any !== 'function') {
    AbortSignal.any = (signals) => {
      const controller = new AbortController();
      const abort = () => controller.abort();
      for (const signal of signals) {
        if (signal.aborted) { abort(); break; }
        signal.addEventListener('abort', abort, { once: true });
      }
      return controller.signal;
    };
  }
});
try {
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('[class*=regionArea]') !== null, undefined, { timeout: 60000 });
  const chromeMs = Date.now() - t0;
  // The board is where the plugin's own data shows up.
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit0', key: '0', altKey: true, bubbles: true }));
  });
  await page.waitForFunction(() => document.querySelector('.dsc-root') !== null, undefined, { timeout: 30000 });
  const boardMs = Date.now() - t0;
  const info = await page.evaluate(() => {
    const text = document.body.innerText ?? '';
    return {
      hasTest: text.includes('test'),
      hasReport: text.includes('报告'),
      groups: [...document.querySelectorAll('.dsc-groups > *, .dsc-group')].length,
      memberRows: document.querySelectorAll('.dsc-row').length,
      domNodes: document.querySelectorAll('*').length,
    };
  });
  const stats = await page.evaluate(async () => {
    const frames = [];
    const long = [];
    const observer = new PerformanceObserver((list) => { for (const e of list.getEntries()) long.push(Math.round(e.duration)); });
    try { observer.observe({ entryTypes: ['longtask'] }); } catch { /* unsupported */ }
    let last = performance.now();
    await new Promise((resolve) => {
      const end = performance.now() + 8000;
      const tick = () => {
        const now = performance.now();
        frames.push(now - last);
        last = now;
        if (now < end) requestAnimationFrame(tick); else resolve();
      };
      requestAnimationFrame(tick);
    });
    observer.disconnect();
    const sorted = [...frames].sort((a, b) => a - b);
    return {
      median: Math.round(sorted[Math.floor(sorted.length / 2)] ?? 0),
      worst: Math.round(Math.max(0, ...frames)),
      over50ms: frames.filter((v) => v > 50).length,
      longTasks: long.length,
      longWorst: long.length === 0 ? 0 : Math.max(...long),
    };
  });
  console.log('LOAD', JSON.stringify({ chromeMs, boardMs, ...info }));
  console.log('PERF', JSON.stringify(stats));
} finally {
  await browser.close();
}
