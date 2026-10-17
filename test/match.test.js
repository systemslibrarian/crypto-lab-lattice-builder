import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sameLattice, containsPoint, makeMatchRounds, visibleMatchPoints, matchStars, parseMatchSeed, parseMatchBest } from '../src/match.ts';

test('lattice equality distinguishes unimodular changes, subsets and equal-area impostors', () => {
  const b={u:[4,0],v:[0,4]};
  for (const c of [{u:[0,4],v:[-4,0]}, {u:[4,4],v:[0,4]}, {u:[8,4],v:[4,4]}]) {
    assert.ok(sameLattice(b,c)); assert.ok(sameLattice(c,b));
  }
  for (const c of [{u:[8,0],v:[0,4]}, {u:[4,2],v:[0,4]}, {u:[2,0],v:[0,4]}, {u:[4,0],v:[8,0]}]) {
    assert.equal(sameLattice(b,c),false); assert.equal(sameLattice(c,b),false);
  }
  assert.equal(containsPoint(b,[2,0]),false);
  assert.equal(containsPoint(b,[-4,8]),true);
});
test('generated expeditions have one match, integral coordinates and visible differences', () => {
  for(let seed=1;seed<=200;seed++) for(const r of makeMatchRounds(seed)) {
    const expected = new Set(visibleMatchPoints(r.reference).map(p=>p.join(',')));
    assert.equal(r.options.filter(o=>sameLattice(r.reference,o)).length,1);
    for(const option of r.options) {
      assert.ok([...option.u,...option.v].every(Number.isInteger));
      const actual = new Set(visibleMatchPoints(option).map(p=>p.join(',')));
      const samePicture = actual.size===expected.size && [...actual].every(p=>expected.has(p));
      assert.equal(samePicture,sameLattice(r.reference,option));
    }
  }
  assert.deepEqual(makeMatchRounds(42),makeMatchRounds(42));
  assert.notDeepEqual(makeMatchRounds(42),makeMatchRounds(43));
});
test('viewport enumeration includes all points even with long skewed arrows', () => {
  // Same 4-unit square grid, expressed by long, nearly parallel vectors.
  const skew = {u:[28,20],v:[16,12]};
  const actual = new Set(visibleMatchPoints(skew,24).map(p=>p.join(',')));
  const expected = new Set();
  for(let x=-24;x<=24;x+=4) for(let y=-24;y<=24;y+=4) expected.add(`${x},${y}`);
  assert.deepEqual(actual,expected);
  assert.deepEqual(visibleMatchPoints({u:[1,0],v:[2,0]}),[]);
});
test('star rules and persisted or shared input bounds', () => {
  assert.equal(matchStars(0,false),3); assert.equal(matchStars(0,true),2);
  assert.equal(matchStars(1,false),1); assert.equal(matchStars(2,true),1);
  for(const bad of [null,'','0','-1','1.5','1e2','1000000000','<script>']) assert.equal(parseMatchSeed(bad),1);
  assert.equal(parseMatchSeed('999999999'),999999999);
  for(const bad of [null,'','-1','19','NaN','Infinity','2.5','{}']) assert.equal(parseMatchBest(bad),0);
  assert.equal(parseMatchBest('18'),18);
});
