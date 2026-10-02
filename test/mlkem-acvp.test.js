/**
 * mlkem-acvp.test.js — drive src/mlkem.ts over NIST's published ACVP vectors.
 *
 * WHY THIS EXISTS
 *
 * `src/AdvancedMode.tsx` tells a visitor the FIPS 203 algorithm on that page is
 * "checked against all 54 of NIST's published test vectors", and `src/mlkem.ts`
 * opens by saying it "follows the standard closely enough to reproduce NIST's
 * known-answer vectors". Until this file, nothing in this repository checked a
 * single vector: `test/` held one test, for the CSP hash, and `npm test` ran
 * only that. The claim was displayed on the live page and had no evidence
 * behind it anywhere.
 *
 * The number was wrong too, which is the part worth keeping in mind. NIST's
 * ACVP ML-KEM files do not contain 54 tests of anything: keyGen has 75 and
 * encapDecap has 165, across twelve groups. 54 corresponds to nothing in the
 * published set, so the copy was not a rounded count of a real check — it was a
 * figure with no source. The README said "all 54 ... including twelve
 * invalid-ciphertext cases"; the twelve is the GROUP count of the encapDecap
 * file. Both now state what this file measures.
 *
 * WHAT IS CHECKED, AND WHAT IS NOT
 *
 * Every test in the three functions this implementation exposes:
 *
 *   keyGen          75   keyGenInternal(d, z) -> ek, dk
 *   encapsulation   75   encapsInternal(ek, m) -> c, k
 *   decapsulation   30   decaps(dk, c) -> k, including the implicit-rejection
 *                        cases, where a modified ciphertext must yield the
 *                        pseudorandom key rather than an error
 *
 * NOT checked, and deliberately not claimed: the 60 tests in ACVP's
 * `encapsulationKeyCheck` and `decapsulationKeyCheck` groups. Those assert that
 * a malformed key is REJECTED, and this implementation performs no input
 * validation — `decaps` slices the key it is handed. A test that drove those
 * groups would fail, and making them pass means adding validation to an exhibit
 * whose point is the algorithm rather than the API surface. The honest state is
 * recorded here and in the copy, not quietly dropped: 180 of the 240 published
 * tests, named by group.
 *
 * HOW THE SOURCE IS LOADED
 *
 * `src/mlkem.ts` imports its siblings without file extensions, which Vite
 * resolves and Node does not, so the source cannot be imported directly. This
 * builds it with the project's own Vite in library mode and imports the result:
 * the same resolution the page gets, rather than a second copy of the module
 * graph maintained for tests.
 *
 * Vectors are pinned verbatim under test/fixtures/acvp/ with their provenance;
 * see PROVENANCE.md there for the upstream commit and the digests.
 */
import { test, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'vite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const FIXTURES = path.join(HERE, 'fixtures', 'acvp');

const hex = (u8) => Buffer.from(u8).toString('hex');
const bytes = (h) => new Uint8Array(Buffer.from(h, 'hex'));

function vectors(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, `${name}.json`), 'utf8'));
}

let mlkem;

before(async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'mlkem-acvp-'));
  await build({
    root: ROOT,
    logLevel: 'silent',
    configFile: false,
    build: {
      outDir: out,
      emptyOutDir: true,
      minify: false,
      target: 'esnext',
      lib: { entry: path.join(ROOT, 'src', 'mlkem.ts'), formats: ['es'], fileName: 'mlkem' },
    },
  });
  mlkem = await import(path.join(out, 'mlkem.js'));
});

describe('ML-KEM keyGen (FIPS 203) against NIST ACVP', () => {
  const file = vectors('ML-KEM-keyGen-FIPS203');
  assert.equal(file.algorithm, 'ML-KEM');
  assert.equal(file.revision, 'FIPS203');

  for (const group of file.testGroups) {
    for (const v of group.tests) {
      test(`${group.parameterSet} tcId ${v.tcId}`, () => {
        const got = mlkem.keyGenInternal(bytes(v.d), bytes(v.z), group.parameterSet);
        assert.equal(hex(got.ek), v.ek.toLowerCase(), 'encapsulation key');
        assert.equal(hex(got.dk), v.dk.toLowerCase(), 'decapsulation key');
      });
    }
  }
});

describe('ML-KEM encapsulation (FIPS 203) against NIST ACVP', () => {
  const file = vectors('ML-KEM-encapDecap-FIPS203');

  for (const group of file.testGroups.filter((g) => g.function === 'encapsulation')) {
    for (const v of group.tests) {
      test(`${group.parameterSet} tcId ${v.tcId}`, () => {
        const got = mlkem.encapsInternal(bytes(v.ek), bytes(v.m), group.parameterSet);
        assert.equal(hex(got.c), v.c.toLowerCase(), 'ciphertext');
        assert.equal(hex(got.k), v.k.toLowerCase(), 'shared secret');
      });
    }
  }
});

describe('ML-KEM decapsulation (FIPS 203) against NIST ACVP', () => {
  const file = vectors('ML-KEM-encapDecap-FIPS203');

  for (const group of file.testGroups.filter((g) => g.function === 'decapsulation')) {
    for (const v of group.tests) {
      /* `reason` names what the group varied. The modified-ciphertext cases are
         the implicit rejection the exhibit demonstrates: not an error, a
         different key. ACVP's expected k already encodes which it should be, so
         both kinds are one assertion. */
      test(`${group.parameterSet} tcId ${v.tcId}${v.reason ? ` (${v.reason})` : ''}`, () => {
        const got = mlkem.decaps(bytes(v.dk), bytes(v.c), group.parameterSet);
        assert.equal(hex(got), v.k.toLowerCase(), 'shared secret');
      });
    }
  }
});

describe('the vector set this suite covers is the one the copy claims', () => {
  /* The count is asserted so the copy cannot drift from it in silence. If a
     future revision of the ACVP files changes these numbers, this fails and the
     sentence in README.md and src/AdvancedMode.tsx has to move with it — which
     is the whole point of the apparatus around it. */
  test('180 of the 240 published tests, by group', () => {
    const keyGen = vectors('ML-KEM-keyGen-FIPS203');
    const encapDecap = vectors('ML-KEM-encapDecap-FIPS203');
    const count = (file, fn) => file.testGroups
      .filter((g) => (fn ? g.function === fn : true))
      .reduce((n, g) => n + g.tests.length, 0);

    const driven = count(keyGen)
      + count(encapDecap, 'encapsulation')
      + count(encapDecap, 'decapsulation');
    const keyChecks = count(encapDecap, 'encapsulationKeyCheck')
      + count(encapDecap, 'decapsulationKeyCheck');

    assert.equal(count(keyGen), 75, 'keyGen tests');
    assert.equal(count(encapDecap, 'encapsulation'), 75, 'encapsulation tests');
    assert.equal(count(encapDecap, 'decapsulation'), 30, 'decapsulation tests');
    assert.equal(driven, 180, 'tests this suite drives');
    assert.equal(keyChecks, 60, 'key-validation tests this implementation does not claim');
    assert.equal(driven + keyChecks, 240, 'published tests in the two files');
  });
});
