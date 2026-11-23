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
try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('[class*=regionArea]') !== null, undefined, { timeout: 60000 });
  await page.waitForTimeout(4000);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit0', key: '0', altKey: true, bubbles: true })));
  await page.waitForTimeout(4000);
  const info = await page.evaluate(() => {
    const root = document.querySelector('.dsc-root') ?? document.querySelector('.dsc-member-panel');
    return {
      boardMounted: document.querySelector('.dsc-root') !== null,
      text: (root?.innerText ?? '(no board)').replace(/\n{2,}/gu, '\n').slice(0, 400),
      groupSections: document.querySelectorAll('.dsc-groups > *').length,
      rows: document.querySelectorAll('.dsc-row').length,
      publishMarkers: [...document.querySelectorAll('*')].filter((n) => (n.textContent ?? '').startsWith?.('sessionCards')).length,
    };
  });
  console.log(JSON.stringify(info, null, 1));
} finally {
  await browser.close();
}
