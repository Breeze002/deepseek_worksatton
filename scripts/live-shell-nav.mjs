/**
 * Open a conversation the way the shell itself does — clicking a session in the sidebar — and measure
 * the same numbers as scripts/live-conv.mjs. Run it with the plugin disabled to separate the shell's
 * own cost from the panel's.
 */
import { chromium } from 'playwright';
const url = process.argv[2];
const index = Number(process.argv[3] ?? '1');
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
try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('[class*=regionArea]') !== null, undefined, { timeout: 60000 });
  await page.waitForTimeout(6000);
  await page.evaluate(() => {
    window.__lt = [];
    try {
      new PerformanceObserver((list) => { for (const e of list.getEntries()) window.__lt.push(Math.round(e.duration)); })
        .observe({ entryTypes: ['longtask'] });
    } catch { /* unsupported */ }
  });
  const target = await page.evaluate((wanted) => {
    const region = document.querySelector('[class*=regionArea]');
    if (region === null) return null;
    const clickable = [...region.querySelectorAll('button, [role="button"], [role="option"], [role="listitem"], li, [class*=item], [class*=row]')]
      .filter((node) => node.getBoundingClientRect().height > 12 && (node.textContent ?? '').trim().length > 1);
    const node = clickable[wanted];
    if (node === undefined) return { count: clickable.length, text: null };
    const text = (node.textContent ?? '').trim().slice(0, 30);
    node.click();
    return { count: clickable.length, text };
  }, index);
  const t0 = Date.now();
  await page.waitForTimeout(3000);
  const switchMs = Date.now() - t0;
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
      median: Math.round(sorted[Math.floor(sorted.length / 2)] ?? 0),
      worst: Math.round(Math.max(0, ...frames)),
      over50: frames.filter((v) => v > 50).length,
      longTasks: window.__lt.length,
      longWorst: window.__lt.length === 0 ? 0 : Math.max(...window.__lt),
      panel: document.querySelector('.dsc-member-panel') !== null,
      url: location.hash || '',
    };
  });
  console.log('CLICKED', JSON.stringify(target));
  console.log('RESULT', JSON.stringify({ switchMs, ...stats }));
} finally {
  await browser.close();
}
