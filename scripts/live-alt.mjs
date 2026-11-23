/**
 * Which side owns Alt+digit? Open the board, press it, and see where the view goes: my layer would
 * show a member's conversation (my own anchor appears), the host would leave for its own page.
 */
import { chromium } from 'playwright';
const url = process.argv[2];
const code = process.argv[3] ?? 'Digit5';
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
const snap = () => page.evaluate(() => ({
  url: location.href.replace(/token=[^&]+/u, 'token=…'),
  cards: document.querySelector('.dsc-root') !== null,
  anchor: document.querySelector('.dsc-reading-anchor') !== null,
  panel: document.querySelector('.dsc-member-panel') !== null,
  head: (document.body.innerText ?? '').replace(/\s+/gu, ' ').slice(0, 90),
}));
const press = (code, mods) => page.evaluate(({ value, modifiers }) => {
  const digit = value.replace('Digit', '');
  window.dispatchEvent(new KeyboardEvent('keydown', {
    code: value,
    key: digit,
    altKey: !modifiers.includes('none') || modifiers.includes('alt'),
    shiftKey: modifiers.includes('shift'),
    ctrlKey: modifiers.includes('ctrl'),
    bubbles: true,
  }));
}, { value: code, modifiers: mods });
try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('[class*=regionArea]') !== null, undefined, { timeout: 30000 });
  await page.waitForTimeout(5000);
  await press('Digit0', ['alt']); // my board
  await page.waitForTimeout(2000);
  console.log('WITH-BOARD', JSON.stringify(await snap()));
  await press(code, (process.env.MODS ?? 'alt').split(','));
  await page.waitForTimeout(2500);
  const after = await snap();
  console.log('AFTER-' + code, JSON.stringify(after));
  console.log('VERDICT', after.anchor === true ? 'a member conversation opened ✓ (my layer handled it)' : after.cards === true ? 'the board is still up — nobody handled it' : 'the board is gone and no conversation opened ✗ (the host navigated away)');
} finally {
  await browser.close();
}
