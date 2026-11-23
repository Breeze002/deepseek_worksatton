/**
 * Compare each member's Session data against the status the panel renders.
 * A status bug is only visible by holding the two side by side.
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
  await page.waitForTimeout(5000);
  const report = await page.evaluate(async () => {
    const probe = window.__sessionCards;
    const groups = probe.groups();
    const byId = probe.sessionIndex();
    const rows = [];
    for (const group of groups) {
      for (const member of group.members ?? []) {
        const node = byId[member.sessionId];
        rows.push({
          group: group.name,
          alias: (member.alias ?? '').slice(0, 12),
          known: node !== undefined,
          running: node?.running ?? null,
          subagents: node?.runningSubagentCount ?? null,
          pending: node?.pendingInteraction ?? null,
          completed: node?.completed ?? null,
          keys: node === undefined ? [] : Object.keys(node).filter((k) => /run|pending|complete|status|busy|idle/i.test(k)),
        });
      }
    }
    // open each member's Session so the panel can render its status, then read the rows
    const first = groups[0]?.members?.[0];
    if (first !== undefined) probe.openSession?.(first.sessionId);
    await new Promise((resolve) => { window.setTimeout(resolve, 2500); });
    return { rows, rendered: probe.panels(), indexSize: Object.keys(byId).length, current: probe.currentSessionId() };
  });
  console.log('INDEX-SIZE', report.indexSize, 'CURRENT', report.current);
  for (const row of report.rows) {
    console.log('  ', row.group, row.alias, '| known:', row.known, 'running:', row.running, 'sub:', row.subagents, 'pending:', row.pending, 'completed:', row.completed, '| keys:', row.keys.join(','));
  }
  console.log('RENDERED-ROWS', JSON.stringify(report.rendered.slice(0, 10)));
} finally {
  await browser.close();
}
