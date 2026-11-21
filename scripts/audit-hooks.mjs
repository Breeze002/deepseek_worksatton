#!/usr/bin/env node
/**
 * Guard against the bug class that blanked the panel: a React hook called after an early return
 * changes the hook count between renders and makes React drop the whole surface.
 *
 *   node scripts/audit-hooks.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLIENT_DIR = resolve(root, 'src/client');

/** Every client module: the checks below are per file, so a split cannot hide code from them. */
const clientFiles = (function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return entry.name.endsWith('.js') ? [path] : [];
  });
})(CLIENT_DIR);
const files = clientFiles.map((path) => ({
  name: relative(root, path),
  source: readFileSync(path, 'utf8').split('\n'),
}));

// React hooks and this package's own custom hooks (`useController(`, `useSessionIndex(`…).
const hookPattern = /(?:\bReact\.use[A-Za-z]+|\buse[A-Z][A-Za-z0-9]*)\s*\(/u;
const earlyReturnPattern = /^ {2}if \(.*\)\s*return\b/u;
const startPattern = /^(?:export )?function ([A-Z][A-Za-z0-9]*)\(/;
let current = null;
let depth = 0;
let firstHook = null;
let earlyReturn = null;
const problems = [];

for (const { name: fileName, source } of files) {
for (const [offset, line] of source.entries()) {
  const start = startPattern.exec(line);
  if (start !== null) {
    current = { name: start[1], line: offset + 1 };
    depth = 0;
    firstHook = null;
    earlyReturn = null;
  } else if (current !== null) {
    if (hookPattern.test(line) && firstHook === null) firstHook = offset + 1;
    // An early return before the first hook, and any hook after an early return, both change the
    // hook list between renders — the second shape is React error #310.
    if (earlyReturn === null && earlyReturnPattern.test(line)) {
      earlyReturn = offset + 1;
      if (firstHook === null) {
        problems.push(`${current.name} (line ${current.line}): early return at line ${offset + 1} precedes the first React hook`);
      }
    } else if (earlyReturn !== null && hookPattern.test(line)) {
      problems.push(`${current.name} (line ${current.line}): hook at line ${offset + 1} runs after the early return at line ${earlyReturn}`);
    }
    depth += (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length;
    if (depth <= 0 && line.startsWith('}')) current = null;
  }
}
}

if (problems.length > 0) {
  console.error('FAIL: hook order can change between renders:');
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
// Components live at module scope; every helper they call must too. A component referencing a
// binding declared inside `apply` only fails when that key or click happens, which no build or
// render test would catch.
// Comments and strings would produce false positives ("Readiness marker", "the last release…").
const strip = (lines) => lines
  .join('\n')
  .replace(/\/\*[\s\S]*?\*\//gu, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/gu, '$1 ')
  // String literals hold CSS class names and messages, which are not bindings.
  .replace(/'(?:[^'\\]|\\.)*'/gu, "''")
  .replace(/"(?:[^"\\]|\\.)*"/gu, '""')
  .replace(/`(?:[^`\\]|\\.)*`/gu, '``');
const perFile = files.map((file) => ({ name: file.name, source: file.source, text: strip(file.source) }));
const text = perFile.map((file) => file.text).join('\n');
// Per file: a component must not read a binding that lives inside that file's own apply().
const leaked = [];
for (const file of perFile) {
  const applyIndex = file.text.indexOf('export async function apply(');
  if (applyIndex < 0) continue;
  const modulePart = file.text.slice(0, applyIndex);
  const applyPart = file.text.slice(applyIndex);
  const declared = new Set(
    [...applyPart.matchAll(/^ {2}(?:const|let|function) ([A-Za-z_$][\w$]*)/gmu)].map((match) => match[1]),
  );
  for (const name of declared) {
    if (name.length < 4) continue;
    if (new RegExp(`(^|[^\\w$.])${name}\\b`, 'mu').test(modulePart)) leaked.push(`${file.name}: ${name}`);
  }
}
if (leaked.length > 0) {
  console.error('FAIL: module-scope components reference apply-scope bindings:');
  for (const name of leaked) console.error(`  ${name}`);
  process.exit(1);
}

// Calling a hook inside a conditional expression changes the hook count between renders, which is
// React error #310 — the exact failure that took the panel down when a dialog opened.
const conditionalHook = /(?:\?\?|\?|&&|\|\|)[^;{}]{0,60}?(?:\b|\.)use[A-Z][\w]*\s*(?:\?\.)?\(/u;
const conditionalProblems = [];
for (const file of perFile) {
  for (const [index, line] of file.source.entries()) {
    const code = line.replace(/\/\*[\s\S]*?\*\//gu, ' ').replace(/(^|[^:])\/\/[^\n]*/gu, '$1 ');
    if (conditionalHook.test(code)) {
      conditionalProblems.push(`${file.name}:${index + 1}: ${line.trim().slice(0, 80)}`);
    }
  }
}
if (conditionalProblems.length > 0) {
  console.error('FAIL: a React hook is called conditionally (error #310):');
  for (const problem of conditionalProblems) console.error(`  ${problem}`);
  process.exit(1);
}

console.log('PASS: no React hook follows a top-level early return');
console.log('PASS: no component reaches into apply-scope bindings');
console.log('PASS: no hook is called conditionally');
