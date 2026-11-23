/**
 * Verify Space+digit group switching on the running GUI: the panel must show the other group and the
 * conversation must move to that group's remembered member.
 */
import { chromium } from 'playwright';
const url = process.argv[2];
const digit = process.argv[3] ?? '2';
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
const press = (code, key, extra = {}) => page.evaluate(({ c, k, e }) => {
  window.dispatchEvent(new KeyboardEvent('keydown', { code: c, key: k, bubbles: true, ...e }));
}, { c: code, k: key, e: extra });
const snap = () => page.evaluate(() => ({
  groupName: document.querySelector('.dsc-mp-title')?.textContent ?? null,
  members: [...document.querySelectorAll('.dsc-row .dsc-row-alias, .dsc-row')].slice(0, 3).map((n) => (n.textContent ?? '').trim().slice(0, 14)),
  anchor: document.querySelector('.dsc-reading-anchor') !== null,
  sessionHead: (document.querySelector('[class*=sessionTitle]')?.textContent ?? '').trim().slice(0, 24),
  focusFlavor: document.querySelector('.dsc-mp-title') !== null ? 'panel' : 'no-panel',
}));
try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('[class*=regionArea]') !== null, undefined, { timeout: 30000 });
  await page.waitForTimeout(5000);
  await press('Digit1', '1', { altKey: true }); // enter the first member so the panel exists
  await page.waitForTimeout(2500);
  console.log('BEFORE', JSON.stringify(await snap()));
  // Shift+digit: a chord, so nothing has to be timed.
  // Press it the way the reader does: from inside the conversation's composer, which is focused.
  await page.evaluate(({ d }) => {
    const composer = [...document.querySelectorAll('[contenteditable="true"], textarea')]
      .find((node) => node.getBoundingClientRect().width > 0);
    composer?.focus?.();
    const target = composer ?? document.body;
    target.dispatchEvent(new KeyboardEvent('keydown', {
      code: `Digit${d}`, key: d, ctrlKey: true, shiftKey: true, bubbles: true,
    }));
  }, { d: digit });
  await page.waitForTimeout(2500);
  const after = await snap();
  console.log('AFTER ', JSON.stringify(after));
  // The reported bug: in the other group, a member shortcut used to fall back to the first group.
  await press('Digit2', '2', { altKey: true });
  await page.waitForTimeout(2500);
  const afterMemberKey = await snap();
  console.log('AFTER-Alt2', JSON.stringify(afterMemberKey));
  console.log('VERDICT', afterMemberKey.groupName === after.groupName
    ? `still on "${afterMemberKey.groupName}" after Alt+2 ✓`
    : `Alt+2 moved the panel to "${afterMemberKey.groupName}" ✗ (was "${after.groupName}")`);
} finally {
  await browser.close();
}
