#!/usr/bin/env node
/**
 * Visual check of the question-card cursor.
 *
 * jsdom has no rendering engine, so it cannot answer the only question that matters for the cursor
 * highlight: does our rule actually beat the shell's own styles? This renders the card in real
 * Chromium with the shell's *own* option CSS extracted from the installed package, marks one
 * option, reads the computed style and writes a screenshot for a human to look at.
 *
 *   node scripts/visual-test.mjs        (also: npm run verify:visual)
 *
 * Machine-specific by nature, so it is NOT part of `npm run verify`:
 *   · set DSH_PACKAGES_DIR to the installed Harness's node_modules/@deepseek-ai
 *     (otherwise it is discovered from the `dsh` entry on PATH);
 *   · set CHROME_PATH to a Chrome/Chromium binary (otherwise common paths are probed).
 */
import { existsSync, readFileSync, mkdirSync, writeFileSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = await import('playwright');
// Playwright's own Chromium does not support this distribution; the installed Chrome does.
const CHROME_CANDIDATES = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'];

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The `@deepseek-ai` package directory of the installed Harness, wherever this machine keeps it. */
function resolveDshPackages() {
  const looksRight = (dir) => existsSync(resolve(dir, 'dsh-client-ui-user-questions', 'lib', 'client.js'));
  const candidates = [];
  if (process.env.DSH_PACKAGES_DIR) candidates.push(process.env.DSH_PACKAGES_DIR);
  for (const entry of (process.env.PATH ?? '').split(':').filter(Boolean)) {
    const binary = resolve(entry, 'dsh');
    if (!existsSync(binary)) continue;
    try {
      const real = realpathSync(binary);
      candidates.push(resolve(dirname(real), '..', 'node_modules', '@deepseek-ai'));
      candidates.push(resolve(dirname(real), 'node_modules', '@deepseek-ai'));
    } catch {
      /* an unreadable entry is simply skipped */
    }
  }
  candidates.push('/usr/lib/node_modules/@deepseek-ai', '/usr/local/lib/node_modules/@deepseek-ai');
  const dshEnv = process.env.DSH_HOME;
  if (dshEnv) candidates.push(resolve(dshEnv, 'node_modules', '@deepseek-ai'));
  return candidates.find(looksRight) ?? null;
}

const DSH = resolveDshPackages();
if (DSH === null) {
  console.error('FAIL: could not locate the installed Harness packages.');
  console.error('  Point DSH_PACKAGES_DIR at the Harness node_modules/@deepseek-ai directory, e.g.');
  console.error('  DSH_PACKAGES_DIR=$(dirname "$(readlink -f "$(command -v dsh)")")/../node_modules/@deepseek-ai npm run verify:visual');
  process.exit(1);
}

/* ---------------------------------------------------------------- shell styles -------------- */

const questionsBundle = readFileSync(resolve(DSH, 'dsh-client-ui-user-questions/lib/client.js'), 'utf8');
// The shell ships CSS-module class names; take the real ones so the cascade is faithful.
const prefixMatch = /\.([A-Za-z0-9]+)_optionRow\b/u.exec(questionsBundle);
if (prefixMatch === null) {
  console.error('FAIL: could not find the shell option-row class in dsh-client-ui-user-questions');
  process.exit(1);
}
const prefix = prefixMatch[1];
const shellRules = (questionsBundle.match(/\.[A-Za-z0-9_]{4,60}\{[^}]{0,400}\}/gu) ?? [])
  .filter((rule) => new RegExp(`\\.${prefix}_`, 'u').test(rule))
  .join('\n');

// Any broad outline reset the shell applies to buttons would be the thing to beat.
const shellGlobals = ['dsh-client-ui-conversation', 'dsh-client-ui-chat', 'dsh-client-ui-shell', 'dsh-client-ui-primitives']
  .map((name) => {
    try {
      return readFileSync(resolve(DSH, `${name}/lib/client.js`), 'utf8');
    } catch {
      return '';
    }
  })
  .join('\n');
const outlineResets = (shellGlobals.match(/[^{}]{0,80}\{[^{}]{0,200}outline\s*:\s*(?:none|0)[^{}]{0,120}\}/gu) ?? []).slice(0, 8);

const clientSource = readFileSync(resolve(root, 'src/client/styles.js'), 'utf8');
const cardCss = /const CARD_CSS = ([\s\S]*?);\n/u.exec(clientSource)?.[1]
  ?.replace(/\/\/[^\n]*/gu, '')
  .split('+')
  .map((part) => part.trim().replace(/^'|'$/gu, ''))
  .join('');
if (cardCss === undefined || !cardCss.includes('dsc-card-cursor')) {
  console.error('FAIL: could not read CARD_CSS from the client source');
  process.exit(1);
}

const optionRow = (label, index) => `<div class="${prefix}_optionRow" data-option-row="${index}">
  <button type="button" class="${prefix}_option" role="radio" aria-checked="false" id="option-${index}">${label}</button>
</div>`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
${shellRules}
${outlineResets.join('\n')}
/* a hostile reset, to prove the highlight survives one */
button:focus { outline: none; }
</style><style>${cardCss}</style></head>
<body style="margin:0;background:#1b1b1f;color:#eee;font:14px system-ui">
<div style="padding:16px;width:420px" data-question-key="q1"><div><div role="radiogroup">
${optionRow('first option', 0)}
${optionRow('second option', 1)}
${optionRow('third option', 2)}
</div></div></div>
</body></html>`;

/* ---------------------------------------------------------------- render -------------------- */

const requestedChrome = process.env.CHROME_PATH;
const chromePath = requestedChrome !== undefined && existsSync(requestedChrome)
  ? requestedChrome
  : CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
let browser;
try {
  browser = await chromium.launch(chromePath === undefined ? { channel: 'chrome' } : { executablePath: chromePath });
} catch (failure) {
  console.error('FAIL: no usable Chrome for the visual check.');
  console.error('  Install Chrome/Chromium or set CHROME_PATH=/path/to/chrome.');
  console.error(`  cause: ${failure instanceof Error ? failure.message : String(failure)}`);
  process.exit(1);
}
const page = await browser.newPage({ viewport: { width: 520, height: 320 }, deviceScaleFactor: 2 });
await page.setContent(html, { waitUntil: 'load' });

const result = await page.evaluate(() => {
  const buttons = [...document.querySelectorAll('[data-option-row] button')];
  const read = (element) => {
    const style = getComputedStyle(element);
    return {
      outlineWidth: style.outlineWidth,
      outlineStyle: style.outlineStyle,
      outlineColor: style.outlineColor,
      boxShadow: style.boxShadow,
      backgroundColor: style.backgroundColor,
    };
  };
  const before = read(buttons[1]);
  buttons[1].classList.add('dsc-card-cursor');
  buttons[1].focus();
  return { before, after: read(buttons[1]), marked: buttons[1].classList.contains('dsc-card-cursor') };
});

mkdirSync(resolve(root, 'artifacts'), { recursive: true });
const shot = resolve(root, 'artifacts/card-cursor.png');
await page.screenshot({ path: shot });
await browser.close();

const visible = (style) => Number.parseFloat(style.outlineWidth) > 0 && style.outlineStyle !== 'none';

let failed = 0;
const check = (label, condition, detail = '') => {
  console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${label}${detail === '' ? '' : ` — ${detail}`}`);
  if (!condition) failed += 1;
};

console.log(`shell option classes: ${prefix}_option / ${prefix}_optionRow`);
console.log(`shell outline resets included: ${outlineResets.length}`);
check('the class lands on the option', result.marked);
check('the option has no outline before marking', !visible(result.before), JSON.stringify(result.before));
check('the marked option gets a visible outline', visible(result.after), JSON.stringify(result.after));
check('the outline keeps our business colour', result.after.outlineColor === 'rgb(47, 111, 237)', `${result.before.outlineColor} -> ${result.after.outlineColor}`);
check(
  'and the row is tinted as well',
  result.after.backgroundColor !== result.before.backgroundColor,
  `${result.before.backgroundColor} -> ${result.after.backgroundColor}`,
);
writeFileSync(resolve(root, 'artifacts/card-cursor.txt'), JSON.stringify({ before: result.before, after: result.after }, null, 2));
console.log(`screenshot: ${shot}`);
console.log(failed === 0 ? 'PASS: the cursor highlight wins the cascade' : `FAIL: ${failed} visual check(s) failed`);
process.exit(failed === 0 ? 0 : 1);
