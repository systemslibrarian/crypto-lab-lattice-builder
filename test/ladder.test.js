import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LADDER, alphabet, formatSpace, spaceLog10 } from '../src/mlwe.ts';

// The README's "Turn it up" table states one coefficient-pattern count per rung. Those counts
// are alphabet^(n*k), and the alphabet widens up the ladder (eta 1, 2, 2, 2, 3),
// which is why they are 3^8, 5^16, 5^32, 5^64 and 7^512 rather than powers of
// one base. Pinned here so a change to LADDER has to change the README too.
test('each rung of the ladder has the coefficient-pattern count the README prints', () => {
  assert.deepEqual(LADDER.map(p => p.eta), [1, 2, 2, 2, 3]);
  assert.deepEqual(LADDER.map(alphabet), [3, 5, 5, 5, 7]);
  assert.deepEqual(LADDER.map(p => p.n * p.k), [8, 16, 32, 64, 512]);
  assert.deepEqual(LADDER.map(p => Math.round(spaceLog10(p))), [4, 11, 22, 45, 433]);
  assert.deepEqual(LADDER.map(formatSpace), [
    '6,561',             // 3^8, the breakable rung
    '152,587,890,625',   // 5^16, exact count
    '5^32',             // 5^32
    '5^64',             // 5^64
    '7^512',            // 7^512, ML-KEM-512's shape
  ]);
});

test('the shortest 2D vector may use coefficients beyond forty', async () => {
  const { trueShortest, combine, PUBLIC, SECRET } = await import('../src/basis.ts');
  const skew = { name: 'skew', u: [2, 0], v: [102, 1] };
  const answer = trueShortest(skew);
  assert.deepEqual(answer.vec, [0, 1]);
  assert.deepEqual(answer.ij, [-51, 1]);
  for (const basis of [skew, PUBLIC, SECRET]) {
    const best = trueShortest(basis);
    assert.deepEqual(combine(basis, ...best.ij), best.vec);
  }
  assert.deepEqual(trueShortest(PUBLIC).vec, trueShortest(SECRET).vec);
});
