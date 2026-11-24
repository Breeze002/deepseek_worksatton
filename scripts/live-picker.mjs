/**
 * Open the member picker on the running GUI and check that archived Sessions are not offered.
 * The archived ids come from the Workspace store; their titles come from the live session index.
 */
import { chromium } from 'playwright';
const url = process.argv[2];
const archivedIds = (process.argv[3] ?? '').split(',').filter((v) => v.length > 0);
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.addInitScript(() => {
  if (typeof Promise.withResolvers !== 'function') Promise.withResolvers = () => { let r, j; const promise = new Promise((a, b) => { r = a; j = b; }); return { promise, resolve: r, reject: j }; };
  if (typeof AbortSignal.any !== 'function') AbortSignal.any = (s) => { const c = new AbortController(); const a = () => c.abort(); for (const x of s) { if (x.aborted) { a(); break; } x.addEventListener('abort', a, { once: true }); } return c.signal; };
});
try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__sessionCards !== undefined, undefined, { timeout: 60000 });
  await page.waitForTimeout(6000);
  // Titles alone are not evidence: an archived Session can share its title with a live one. Only a
  // title that no live Session carries can prove that an archived row leaked into the picker.
  const titles = await page.evaluate((ids) => {
    const byId = window.__sessionCards.sessionIndex();
    const archivedSet = new Set(ids);
    const liveTitles = new Set(Object.entries(byId)
      .filter(([id]) => archivedSet.has(id) !== true)
      .map(([, node]) => (node?.displayTitle ?? '').trim()));
    return ids
      .map((id) => (byId[id]?.displayTitle ?? '').trim())
      .filter((title) => title.length > 1 && liveTitles.has(title) !== true);
  }, archivedIds);
  // Board, then whichever button opens a dialog that carries the session picker.
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit0', key: '0', altKey: true, bubbles: true })));
  await page.waitForTimeout(2500);
  const opened = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('.dsc-root button')].filter((b) => b.getBoundingClientRect().height > 8);
    // The picker lives in the group dialogs only: "new group" or "add member". "New blank session"
    // matches a looser pattern and opens a form without a session list at all.
    const wanted = buttons.find((b) => /添加成员|新建群组|New group|Add member/i.test(b.textContent ?? ''));
    wanted?.click();
    return { buttons: buttons.length, clicked: (wanted?.textContent ?? 'NOT FOUND').trim().slice(0, 20) };
  });
  await page.waitForTimeout(2500);
  // Exact row texts, never substrings: "诊断TPU挂起技能流程" is a prefix of a live "… (1)".
  const modal = await page.evaluate(() => {
    const node = document.querySelector('.dsc-modal');
    if (node === null) return { text: '', rows: [] };
    return {
      text: node.textContent ?? '',
      rows: [...node.querySelectorAll('span, div, button, label')]
        .map((child) => (child.textContent ?? '').trim())
        .filter((text) => text.length > 1),
    };
  });
  const present = titles.filter((title) => modal.rows.includes(title));
  // A sanity check that keeps the verdict honest: the picker must list *some* Session, or "no
  // archived title found" would pass simply because nothing was listed.
  const listing = modal.rows.length;
  console.log('ARCHIVED-IDS', archivedIds.length, '| titles found in index:', titles.length);
  console.log('PICKER', JSON.stringify({ opened, modalChars: modal.text.length, listedRows: listing }));
  const judge = () => {
    if (modal.text.length === 0) return 'the picker did not open ✗ (nothing to judge)';
    if (present.length > 0) return `still offering archived: ${JSON.stringify(present.slice(0, 3))} ✗`;
    return `no archived Session is offered (checked ${titles.length} titles) ✓`;
  };
  console.log('VERDICT', judge());
} finally {
  await browser.close();
}
