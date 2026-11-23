/**
 * Verify on the running GUI that entering a Session puts the keyboard in the conversation.
 * Read-only apart from two synthetic key presses; prints where the focus actually landed.
 */
import { chromium } from 'playwright';
const url = process.argv[2];
if (url === undefined) throw new Error('usage: node scripts/live-focus.mjs <url>');
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
const describe = () => page.evaluate(() => {
  const active = document.activeElement;
  const anchor = document.querySelector('.dsc-reading-anchor');
  let region = null;
  let composer = null;
  if (anchor !== null) {
    const anchorBox = anchor.getBoundingClientRect();
    const minWidth = Math.max(360, window.innerWidth * 0.5);
    for (const node of document.querySelectorAll('div')) {
      if (node.closest('.dsc-member-panel') !== null) continue;
      if (node.scrollHeight <= node.clientHeight || node.clientHeight < 200) continue;
      const style = getComputedStyle(node);
      if (style.overflowY !== 'auto' && style.overflowY !== 'scroll' && style.overflowY !== 'overlay') continue;
      const box = node.getBoundingClientRect();
      if (box.width < minWidth || box.top < anchorBox.top) continue;
      if (region === null || node.clientHeight > region.clientHeight) region = node;
    }
    if (region !== null) {
      const box = region.getBoundingClientRect();
      for (const node of document.querySelectorAll('[contenteditable="true"], textarea')) {
        if (node.closest('.dsc-member-panel') !== null) continue;
        const rect = node.getBoundingClientRect();
        if (rect.width === 0 || rect.left < box.left - 40 || rect.right > box.right + 40) continue;
        if (composer === null || rect.top > composer.getBoundingClientRect().top) composer = node;
      }
    }
  }
  return {
    active: active === null ? 'none' : `${active.tagName}${active.getAttribute?.('contenteditable') === 'true' ? '[editable]' : ''}`,
    insideConversation: region !== null && active !== null && region.contains(active),
    isComposer: composer !== null && active === composer,
    hasRegion: region !== null,
    anchor: anchor !== null,
  };
});
try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('[class*=regionArea]') !== null, undefined, { timeout: 30000 });
  await page.waitForTimeout(5000);
  console.log('BEFORE', JSON.stringify(await describe()));
  // Park the focus somewhere outside the conversation, as a right-hand pane would hold it.
  await page.evaluate(() => document.body.focus?.());
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit2', key: '2', altKey: true, bubbles: true }));
  });
  await page.waitForTimeout(2500);
  const after = await describe();
  console.log('AFTER-Alt2', JSON.stringify(after));
  console.log(
    'VERDICT',
    after.isComposer === true
      ? 'the composer in the conversation holds the focus ✓'
      : after.insideConversation === true
        ? 'the conversation holds the focus (scroller fallback) ✓'
        : 'focus did NOT land in the conversation ✗',
  );
} finally {
  await browser.close();
}
