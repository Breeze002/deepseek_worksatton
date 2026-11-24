import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
const page = await browser.newPage();
await page.addInitScript(() => {
  if (typeof Promise.withResolvers !== 'function') Promise.withResolvers = () => { let r, j; const promise = new Promise((a, b) => { r = a; j = b; }); return { promise, resolve: r, reject: j }; };
  if (typeof AbortSignal.any !== 'function') AbortSignal.any = (s) => { const c = new AbortController(); const a = () => c.abort(); for (const x of s) { if (x.aborted) { a(); break; } x.addEventListener('abort', a, { once: true }); } return c.signal; };
});
try {
  await page.goto(process.argv[2], { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__sessionCards !== undefined, undefined, { timeout: 60000 });
  await page.waitForTimeout(6000);
  const out = await page.evaluate(() => {
    const byId = window.__sessionCards.sessionIndex();
    const ids = Object.keys(byId);
    const sample = byId[ids[0]] ?? {};
    const withArchived = ids.filter((id) => 'archived' in (byId[id] ?? {}));
    const proj = sample.projectionValues ?? {};
    const withFlag = ids.filter((id) => JSON.stringify(byId[id]?.projectionValues ?? {}).toLowerCase().includes('archiv'));
    return {
      count: ids.length,
      keys: Object.keys(sample),
      projectionKeys: Object.keys(proj),
      projectionSample: JSON.stringify(proj).slice(0, 300),
      sessionsWithArchivedInProjection: withFlag.length,
      archivedNamesSample: withFlag.slice(0, 2).map((id) => JSON.stringify(byId[id].projectionValues).slice(0, 200)),
    };
  });
  console.log(JSON.stringify(out, null, 1));
} finally { await browser.close(); }
