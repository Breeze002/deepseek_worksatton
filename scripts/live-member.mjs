/**
 * Enter a member conversation the way the user does (Alt+digit, retried) and report why it feels
 * stuck: frame health, the composer's state, and whether that Session is still running a turn.
 */
import { chromium } from 'playwright';
const url = process.argv[2];
const digit = process.argv[3] ?? '5';
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
const press = (value) => page.evaluate((v) => {
  window.dispatchEvent(new KeyboardEvent('keydown', { code: v, key: v.replace('Digit', ''), altKey: true, bubbles: true }));
}, value);
const state = () => page.evaluate(() => {
  const anchor = document.querySelector('.dsc-reading-anchor');
  const composer = [...document.querySelectorAll('[contenteditable="true"], textarea')]
    .find((node) => node.getBoundingClientRect().width > 0);
  const buttons = [...document.querySelectorAll('button')].map((b) => (b.textContent ?? '').trim());
  return {
    anchor: anchor !== null,
    cards: document.querySelector('.dsc-root') !== null,
    url: location.href.replace(/token=[^&]+/u, 'token=…'),
    sessionTitle: [...document.querySelectorAll('[class*=sessionTitle], h1, h2')].map((n) => (n.textContent ?? '').trim()).filter((t) => t !== '').slice(0, 2),
    sidebarTitles: [...document.querySelectorAll('aside [class*=title], nav [class*=title]')]
      .map((n) => (n.textContent ?? '').trim())
      .filter((t) => t !== '')
      .slice(0, 12),
    composer: composer === undefined ? 'none' : {
      tag: composer.tagName,
      disabled: composer.getAttribute('contenteditable') === 'false' || composer.disabled === true,
      focused: document.activeElement === composer,
    },
    stopVisible: buttons.some((text) => /Stop|停止/u.test(text)),
    queueVisible: buttons.some((text) => /Queue|排队/u.test(text)),
    head: (document.body.innerText ?? '').replace(/\s+/gu, ' ').slice(0, 70),
  };
});
try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('[class*=regionArea]') !== null, undefined, { timeout: 30000 });
  await page.waitForTimeout(5000);
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    await press(`Digit${digit}`);
    await page.waitForTimeout(1500);
    const now = await state();
    console.log(`TRY-${attempt}`, JSON.stringify(now));
    if (now.anchor === true) {
      // Keep pressing the way the reader does: with the fix these presses must change nothing.
      for (let extra = 0; extra < 3; extra += 1) {
        await press(`Digit${digit}`);
        await page.waitForTimeout(900);
      }
      console.log('AFTER-REPEATS', JSON.stringify(await state()));
      break;
    }
  }
  // Reproduce "sending a message throws me out": type into the composer and press Enter for real.
  if (process.env.SEND === '1') {
    const before = await state();
    await page.evaluate(() => {
      const composer = [...document.querySelectorAll('[contenteditable="true"]')]
        .find((node) => node.getBoundingClientRect().width > 0);
      composer?.focus?.();
    });
    await page.keyboard.type(process.env.SEND_TEXT ?? '测试，请忽略');
    await page.waitForTimeout(600);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(4000);
    const after = await state();
    console.log('BEFORE-SEND', JSON.stringify(before));
    console.log('AFTER-SEND ', JSON.stringify(after));
    console.log('VERDICT', after.anchor === true ? 'still in the member session ✓' : 'the view left the session ✗ (reproduced)');
  }

  const stats = await page.evaluate(async () => {
    const frames = [];
    const long = [];
    const observer = new PerformanceObserver((list) => { for (const entry of list.getEntries()) long.push(Math.round(entry.duration)); });
    try { observer.observe({ entryTypes: ['longtask'] }); } catch { /* unsupported */ }
    let last = performance.now();
    await new Promise((resolve) => {
      const end = performance.now() + 8000;
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
    return {
      median: Math.round(sorted[Math.floor(sorted.length / 2)] ?? 0),
      worst: Math.round(Math.max(0, ...frames)),
      over50ms: frames.filter((value) => value > 50).length,
      longTasks: long.length,
      longWorst: long.length === 0 ? 0 : Math.max(...long),
      domNodes: document.querySelectorAll('*').length,
    };
  });
  console.log('PERF', JSON.stringify(stats));
} finally {
  await browser.close();
}
