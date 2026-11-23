/**
 * Verify on the running page that a focused field keeps the keys a question card would otherwise take.
 * A card of the shell's shape is injected, plus a field outside it, and the keys are dispatched from
 * inside that field — the situation the reader reported as "the answer box cannot be typed in".
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
try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__sessionCards !== undefined, undefined, { timeout: 60000 });
  await page.waitForTimeout(4000);
  const result = await page.evaluate(async () => {
    const card = document.createElement('div');
    card.setAttribute('data-question-key', 'probe-q1');
    card.style.cssText = 'position:fixed;left:40px;top:120px;width:420px;background:#fff;padding:12px;z-index:99999';
    const group = document.createElement('div');
    group.setAttribute('role', 'radiogroup');
    const clicks = [];
    for (const label of ['one', 'two']) {
      const row = document.createElement('div');
      row.setAttribute('data-option-row', '');
      const button = document.createElement('button');
      button.setAttribute('role', 'radio');
      button.setAttribute('aria-checked', 'false');
      button.textContent = label;
      button.addEventListener('click', () => { clicks.push(label); button.setAttribute('aria-checked', 'true'); });
      row.appendChild(button);
      group.appendChild(row);
    }
    card.appendChild(group);
    // The shell puts the free-text row as a sibling of the options container, inside the wrapper.
    const wrapper = document.createElement('div');
    wrapper.appendChild(group);
    const textarea = document.createElement('textarea');
    textarea.style.cssText = 'display:block;width:380px;height:60px;margin-top:6px';
    wrapper.appendChild(textarea);
    card.innerHTML = '';
    // The shell's card keeps its rows in a scrollable container; the cursor walk expects one.
    const scroller = document.createElement('div');
    scroller.style.cssText = 'max-height:120px;overflow-y:auto';
    scroller.appendChild(wrapper);
    card.appendChild(scroller);
    document.body.appendChild(card);
    // Re-read the row after the rebuild: the earlier reference belongs to a detached node.
    const row = card.querySelector('textarea');
    const field = document.createElement('textarea');
    field.style.cssText = 'position:fixed;left:40px;top:400px;width:420px;height:80px;z-index:99999';
    document.body.appendChild(field);
    const fire = (target, code, key, extra = {}) => {
      const event = new KeyboardEvent('keydown', { code, key, bubbles: true, cancelable: true, ...extra });
      target.dispatchEvent(event);
      return event.defaultPrevented;
    };
    const checked = () => [...card.querySelectorAll('button')].map((b) => b.getAttribute('aria-checked')).join(',');
    field.focus();
    const out = { focusedIsField: document.activeElement === field, checkedBefore: checked() };
    out.digitPrevented = fire(field, 'Digit2', '2');
    out.checkedAfterDigitInField = checked();
    out.spacePrevented = fire(field, 'Space', ' ');
    out.enterPrevented = fire(field, 'Enter', 'Enter');
    await new Promise((r) => window.setTimeout(r, 200));
    out.clicksAfterFieldKeys = clicks.slice();
    // Moving onto the free-text row with the keyboard must hand it the caret: a marked box the reader
    // cannot type into is exactly what was reported.
    // The probe's own field must let go first: it was focused earlier, and it is a textarea too.
    field.blur();
    field.style.display = 'none';
    row.blur();
    document.body.focus?.();
    // Walk the cursor down until it lands on the card's free-text row — the starting index depends on
    // the keys pressed before, so counting steps would be a guess.
    for (let step = 0; step < 10 && card.contains(document.activeElement) !== true; step += 1) {
      fire(document.body, 'ArrowDown', 'ArrowDown');
    }
    // Judge it semantically: the caret must be in a field of this card, whatever node identity the
    // shell's own rendering ends up using.
    out.activeAfterArrows = document.activeElement?.tagName === 'TEXTAREA' && card.contains(document.activeElement);
    out.activeTagAfterArrows = document.activeElement?.tagName ?? 'none';
    if (card.contains(document.activeElement)) {
      out.digitPreventedInRow = fire(row, 'Digit7', '7');
      out.spacePreventedInRow = fire(row, 'Space', ' ');
      out.enterPreventedInRow = fire(row, 'Enter', 'Enter');
    }
    row.blur();

    // And with the focus on the card itself the digit must still answer.
    const button = card.querySelector('button');
    button.focus();
    out.digitPreventedOnCard = fire(button, 'Digit2', '2');
    out.checkedAfterDigitOnCard = checked();
    out.clicksAfterCardKey = clicks.slice();
    field.remove();
    card.remove();
    return out;
  });
  console.log(JSON.stringify(result, null, 1));
  const ok = result.digitPrevented === false && result.spacePrevented === false && result.enterPrevented === false
    && result.clicksAfterFieldKeys.length === 0
    && result.checkedAfterDigitOnCard.includes('true')
    && result.activeAfterArrows === true
    && result.digitPreventedInRow === false;
  console.log('VERDICT', ok ? 'a focused field keeps digits, Space and Enter; the card still answers when focused ✓' : 'NOT fixed ✗');
} finally {
  await browser.close();
}
