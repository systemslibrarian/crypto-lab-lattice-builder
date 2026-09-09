/**
 * csp.test.js — the Content-Security-Policy in index.html must stay honest.
 *
 * index.html carries one inline <script>: the dark-theme pin required by the
 * fleet theme contract. The CSP allows it by sha256 hash rather than by
 * relaxing script-src to 'unsafe-inline', which is the right call — but it
 * creates a failure mode that is completely silent and that nothing else in
 * this repo would catch:
 *
 *   Change ONE BYTE of that script — a reindent, a reworded comment, a
 *   trailing space — and the hash no longer matches. The browser then refuses
 *   to run it. The page still loads, `tsc -b && vite build` still succeeds,
 *   and the theme pin quietly stops working. A visitor who once clicked the
 *   long-removed theme toggle goes back to being pinned to light forever.
 *   Nothing reports it except a console violation nobody is watching.
 *
 * So this file recomputes the hash from the file's own bytes on every run, and
 * the deploy workflow runs it in the job the publish depends on. It is the only
 * thing standing between a whitespace edit and a dead script.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const SOURCE = fileURLToPath(new URL('../index.html', import.meta.url));
const BUILT = fileURLToPath(new URL('../dist/index.html', import.meta.url));

const html = readFileSync(SOURCE, 'utf8');

/** Every inline <script> body, in document order. Ones with src= are external. */
function inlineScripts(doc) {
  return [...doc.matchAll(/<script(?![^>]*\bsrc=)[^>]*>(.*?)<\/script>/gs)].map((m) => m[1]);
}

/** The CSP value, with the newlines the attribute is wrapped across. */
function cspContent(doc, where) {
  const m = doc.match(/http-equiv="Content-Security-Policy"\s*content="([^"]*)"/s);
  assert.ok(m, `${where} must carry a <meta> Content-Security-Policy`);
  return m[1];
}

/** The hashes the CSP declares, as they appear in the policy. */
function declaredHashes(csp) {
  return [...csp.matchAll(/'(sha256-[A-Za-z0-9+/=]+)'/g)].map((m) => m[1]);
}

function sha256(body) {
  return 'sha256-' + createHash('sha256').update(body, 'utf8').digest('base64');
}

/** One directive's value, e.g. directive(csp, 'script-src') -> "'self' 'sha256-…'". */
function directive(csp, name) {
  const m = csp.match(new RegExp(`(?:^|;)\\s*${name}\\s+([^;]*)`));
  return m ? m[1].trim() : null;
}

test('every inline <script> is allowed by a matching sha256 hash', () => {
  const scripts = inlineScripts(html);
  const declared = declaredHashes(cspContent(html, 'index.html'));

  assert.equal(scripts.length, declared.length,
    `index.html has ${scripts.length} inline script(s) but the CSP declares ${declared.length} hash(es) — every inline script needs its own`);

  for (const body of scripts) {
    const computed = sha256(body);
    assert.ok(declared.includes(computed),
      `inline script hash mismatch.\n  computed: ${computed}\n  declared: ${declared.join(', ')}\n`
      + '  The script body changed without the CSP hash being regenerated, so the browser will\n'
      + '  silently refuse to run it and the dark-theme pin will be dead. Paste the computed\n'
      + '  hash above into the script-src directive in index.html.');
  }
});

test("script-src never relaxes to 'unsafe-inline' or 'unsafe-eval'", () => {
  const csp = cspContent(html, 'index.html');
  const scriptSrc = directive(csp, 'script-src');

  assert.ok(scriptSrc, 'the CSP must declare script-src explicitly, not fall back to default-src');
  assert.match(scriptSrc, /'self'/, "script-src must still allow the site's own modules");
  assert.ok(!scriptSrc.includes("'unsafe-inline'"),
    "script-src must not use 'unsafe-inline' — that is the shortcut this hash exists to avoid, and it "
    + 'would let any injected inline script run');
  assert.ok(!scriptSrc.includes("'unsafe-eval'"), "script-src must not use 'unsafe-eval'");

  // style-src DOES carry 'unsafe-inline' here, deliberately: the React app sets
  // inline styles for the lattice geometry. That is a much smaller grant than
  // executable script, so the assertion above is scoped to script-src rather
  // than to the whole policy.
  assert.ok(!csp.includes("'unsafe-eval'"), "no directive may use 'unsafe-eval'");
  assert.match(csp, /object-src 'none'/, "object-src 'none' keeps plugins out");
  assert.match(csp, /base-uri 'self'/, "base-uri 'self' stops an injected <base> repointing every relative URL");
});

test('no inline event handlers, which a hash cannot cover', () => {
  // on*= attributes are inline script the CSP hash does not authorise, so they
  // would be blocked in a browser while looking fine in the source.
  const handlers = [...html.matchAll(/\son[a-z]+\s*=\s*["']/gi)].map((m) => m[0].trim());
  assert.deepEqual(handlers, [], `inline event handlers found: ${handlers.join(', ')}`);
});

test('the theme pin still pins dark, and stores only that', () => {
  // Dark is the only theme in this lab; the pin overwrites any 'light' a
  // visitor stored back when the header carried a toggle. Guard both halves —
  // the attribute the CSS selects on, and the one value the script may write.
  assert.match(html, /<html[^>]*\sdata-theme="dark"/,
    '<html> must ship with data-theme="dark" so the theme is right even before the script runs');
  assert.match(html, /setAttribute\('data-theme',\s*'dark'\)/,
    "the inline pin must set data-theme to 'dark'");

  const writes = [...html.matchAll(/localStorage\.setItem\(\s*'([^']+)'\s*,\s*'([^']+)'/g)]
    .map((m) => `${m[1]}=${m[2]}`);
  assert.deepEqual(writes, ['theme=dark'],
    `index.html may only store the theme pin; found: ${writes.join(', ') || '(none)'}`);
});

test('no theme toggle returns to the page', () => {
  // The fleet removed the toggle because it persisted its choice: one past
  // click pinned a returning visitor to light forever.
  assert.doesNotMatch(html, /id="(?:cl-)?theme-?[Tt]oggle"/,
    'a theme toggle must not render — dark is pinned, one theme per lab');
});

// The hash is computed over the SOURCE bytes, but the browser enforces it
// against the BUILT bytes. Vite copies the inline script through verbatim
// today; this catches the day a plugin starts minifying or re-indenting it,
// which would break the page while every source-level check above stayed green.
// Skipped rather than failed when dist/ is absent — a clean checkout has no
// build, and a guard that fails on a clean checkout gets deleted.
test('the built dist/index.html carries the same script and the same hash', { skip: existsSync(BUILT) ? false : 'dist/ not built' }, () => {
  const built = readFileSync(BUILT, 'utf8');
  const sourceScripts = inlineScripts(html);
  const builtScripts = inlineScripts(built);

  assert.deepEqual(builtScripts, sourceScripts,
    'vite changed the inline script on its way into dist/ — the CSP hash in the built page no longer '
    + 'covers the script the browser will actually see');

  const builtDeclared = declaredHashes(cspContent(built, 'dist/index.html'));
  for (const body of builtScripts) {
    assert.ok(builtDeclared.includes(sha256(body)),
      `dist/index.html inline script is not covered by its own CSP.\n  computed: ${sha256(body)}\n  declared: ${builtDeclared.join(', ')}`);
  }
});
