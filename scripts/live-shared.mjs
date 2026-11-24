/**
 * The reader's own case: one Session sitting in two groups. Switching into it from the later group,
 * then leaving and returning, must not move the panel back to the first group.
 */
import { chromium } from 'playwright';
const url = process.argv[2];
const switchTo = process.argv[3] ?? '3';
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
const group = () => page.evaluate(() => document.querySelector('.dsc-mp-title')?.textContent ?? '(none)');
try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__sessionCards !== undefined, undefined, { timeout: 60000 });
  await page.waitForTimeout(5000);
  await press(`Digit${switchTo}`, switchTo, { shiftKey: true, ctrlKey: true });
  await page.waitForTimeout(2500);
  const landed = await group();
  // Past the 2.5s guard: leave the group and come back, which fires the follow rule.
  await page.waitForTimeout(3000);
  await press('Digit1', '1', { shiftKey: true, ctrlKey: true });
  await page.waitForTimeout(1500);
  await press(`Digit${switchTo}`, switchTo, { shiftKey: true, ctrlKey: true });
  await page.waitForTimeout(2500);
  const stayed = await group();
  console.log('RESULT', JSON.stringify({ landed, stayed }));
  console.log('VERDICT', stayed === landed && landed !== '(none)' ? `still on "${stayed}" ✓` : `moved to "${stayed}" ✗ (was "${landed}")`);
} finally {
  await browser.close();
}
