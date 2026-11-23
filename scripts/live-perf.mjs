/**
 * Measure how responsive the running GUI is, and whether this plugin's own work is on the hot path.
 * Numbers first: "it feels laggy" needs a figure before it can be attributed or fixed.
 */
import { chromium } from 'playwright';
const url = process.argv[2];
if (url === undefined) throw new Error('usage: node scripts/live-perf.mjs <url>');
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
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  // The debug handle only exists in later builds, so wait for the app itself.
  await page.waitForFunction(() => document.querySelector('.dsc-root, .dsc-member-panel, [class*=regionArea]') !== null, undefined, { timeout: 30000 });
  await page.waitForTimeout(4000);
  // Open the board the way the shortcut does (a synthetic event still reaches the layer), so the
  // measurement covers the state the reader is actually in when it feels slow.
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit0', key: '0', altKey: true, bubbles: true }));
  });
  await page.waitForTimeout(2000);
  // …then enter the first member, which is when the member panel is on screen.
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit1', key: '1', altKey: true, bubbles: true }));
  });
  await page.waitForTimeout(2500);
  const stats = await page.evaluate(async () => {
    const frames = [];
    let last = performance.now();
    const long = [];
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) long.push(Math.round(entry.duration));
    });
    try { observer.observe({ entryTypes: ['longtask'] }); } catch { /* unsupported */ }
    await new Promise((resolve) => {
      const end = performance.now() + 10000;
      const tick = () => {
        const now = performance.now();
        frames.push(now - last);
        last = now;
        if (now < end) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
    observer.disconnect();
    const sorted = [...frames].sort((a, b) => a - b);
    const at = (q) => sorted.length === 0 ? 0 : Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))]);
    return {
      frames: frames.length,
      median: at(0.5),
      p95: at(0.95),
      worst: Math.round(Math.max(0, ...frames)),
      over50ms: frames.filter((value) => value > 50).length,
      longTasks: long.length,
      longWorst: long.length === 0 ? 0 : Math.max(...long),
      cardsPresent: document.querySelector('.dsc-root') !== null,
      panelsPresent: document.querySelector('.dsc-member-panel') !== null,
    };
  });
  console.log('PERF', JSON.stringify(stats, null, 1));
} finally {
  await browser.close();
}
