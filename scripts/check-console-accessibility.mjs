#!/usr/bin/env node
/**
 * Lightweight accessibility regression guard for the static Console shell.
 *
 * This is intentionally not advertised as a WCAG/EN 301 549 conformance test.
 * It protects a small set of architectural accessibility decisions that can be
 * checked without a browser: language metadata, keyboard skip navigation,
 * visible focus styling, motion/contrast preferences and accessible live UI.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const html = read('apps/console/public/index.html');
const css = read('apps/console/public/bcs-brand-eu.css');
const js = read('apps/console/public/bcs-brand-eu.js');

const checks = [
  ['document language is declared', /<html\s+lang="en"/i.test(html)],
  ['responsive viewport is declared', /name="viewport"/i.test(html)],
  ['brand/accessibility stylesheet is loaded last', html.indexOf('/bcs-brand-eu.css') > html.indexOf('/ux-shell.css')],
  ['brand/accessibility interaction layer is loaded', html.includes('/bcs-brand-eu.js')],
  ['skip navigation is injected', js.includes('bcs-skip-link') && js.includes('#main-content')],
  ['main landmark is explicit', js.includes("setAttribute('role', 'main')")],
  ['navigation exposes aria-current', js.includes("aria-current")],
  ['workflow error is assertive live content', js.includes("setAttribute('role', 'alert')") && js.includes("aria-live', 'assertive")],
  ['modal keyboard focus is trapped', js.includes("event.key !== 'Tab'") && js.includes("appShell.inert")],
  ['sub-navigation supports keyboard arrows', js.includes('ArrowLeft') && js.includes('ArrowRight') && js.includes("role', 'tablist")],
  ['visible focus styling is present', css.includes(':focus-visible') && css.includes('--bcs-focus')],
  ['reduced-motion preference is respected', css.includes('prefers-reduced-motion:reduce')],
  ['increased-contrast preference is supported', css.includes('prefers-contrast:more')],
  ['Windows forced-colors mode is supported', css.includes('forced-colors:active')],
  ['primary controls use at least 44px targets', css.includes('min-height:44px!important')],
  ['mobile layout breakpoint is present', css.includes('@media(max-width:720px)')]
];

const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
if (failed.length) {
  console.error(`\n${failed.length} accessibility regression check(s) failed.`);
  process.exit(1);
}
console.log(`\n${checks.length} accessibility regression checks passed.`);
