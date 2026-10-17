import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS, advance, basis, canLand, chart, coordinates, initial, readProgress, route, won } from '../src/beacon.ts';

test('every allowed basis describes exactly the same integer lattice, and refits reverse', () => {
  for (let shear = -1; shear <= 2; shear++) {
    const [a, b] = basis(shear);
    assert.equal(a[0] * b[1] - a[1] * b[0], 4);
    for (let x = -13; x <= 13; x++) for (let y = -9; y <= 9; y++) {
      const [m, n] = coordinates([x, y], shear);
      assert.equal(Number.isInteger(m) && Number.isInteger(n), x % 2 === 0 && y % 2 === 0);
      assert.deepEqual([m * a[0] + n * b[0], m * a[1] + n * b[1]], [x, y]);
    }
  }
  const c = chart(0), s = initial(c);
  const trimmed = advance(c, s, 'trim');
  const restored = advance(c, trimmed, 'extend');
  assert.deepEqual(trimmed.position, s.position);
  assert.deepEqual(basis(restored.shear), basis(s.shear));
});

for (let i = 0; i < 6; i++) test(`chart ${i + 1}: target is playable, collects all beacons and freezes only at the dock`, () => {
  const c = chart(i); let s = initial(c);
  for (const p of [c.start, c.dock, ...c.beacons]) assert.equal(canLand(c, p), true);
  assert.equal(new Set([c.start, c.dock, ...c.beacons].map(p => p.join(','))).size, 5);
  const solution = route(c, s); assert.ok(solution && solution.length > 5 && solution.length < 25);
  let pos = [...c.start], shear = 1, collected = 0;
  const frames = [s];
  for (const action of solution) {
    if (action === 'trim') shear--;
    else if (action === 'extend') shear++;
    else {
      const sign = action.endsWith('+') ? 1 : -1;
      pos = [pos[0] + sign * (action[0] === 'a' ? 2 : 2 * shear), pos[1] + sign * (action[0] === 'a' ? 0 : 2)];
    }
    c.beacons.forEach((p, j) => { if (p[0] === pos[0] && p[1] === pos[1]) collected |= 1 << j; });
    s = advance(c, s, action); frames.push(s);
    assert.deepEqual(s.position, pos); assert.equal(s.shear, shear); assert.equal(s.collected, collected);
  }
  assert.equal(won(c, s), true);
  assert.equal(s.jumps + s.refits, solution.length);
  for (const action of ACTIONS) assert.equal(advance(c, s, action), s);
  assert.equal(won(c, frames.at(-2)), false);
  assert.equal(won(c, { ...s, collected: 3 }), false);
  assert.deepEqual(route(c, s), []);
});

test('invalid jumps and refit limits have no cost, and future beacons collect in any order', () => {
  const c = chart(0), s = initial(c);
  let atEdge = advance(c, s, 'a-');
  assert.equal(advance(c, atEdge, 'a-'), atEdge);
  const nearRock = advance(c, s, 'a+');
  assert.equal(advance(c, nearRock, 'a+'), nearRock);
  assert.equal(canLand(c, [-3, 1]), false);
  let low = advance(c, advance(c, s, 'trim'), 'trim');
  assert.equal(advance(c, low, 'trim'), low);
  assert.equal(advance(c, s, 'invalid'), s);
  const nearThird = { ...s, position: [4, 0], shear: 0 };
  assert.equal(advance(c, nearThird, 'b+').collected, 4);
  assert.deepEqual(s.position, [-4, 0]);
});

test('free hints return an action from unusual positions; progress parsing admits only bounded counts', () => {
  for (let i = 0; i < 6; i++) {
    const c = chart(i); let s = initial(c);
    for (let j = 0; j < 20; j++) {
      s = advance(c, s, ACTIONS[(j * 7 + i) % 6]);
      const hint = route(c, s);
      assert.ok(hint); if (!won(c, s)) assert.notEqual(advance(c, s, hint[0]), s);
    }
  }
  for (const raw of [null, 'null', 'bad', 'false', '[]']) assert.deepEqual(readProgress(raw), { best: Array(6).fill(null), sound: false });
  assert.deepEqual(readProgress('{"best":[12,0,-1,3.5,10000,17,2],"sound":"yes"}'), { best: [12,null,null,null,null,17], sound:false });
});
