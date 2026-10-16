import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FLIGHT_MISSIONS, flightRoute, flightPar, flightMedal, newFlight, moveFlight, readFlightMedals } from '../src/flight.ts';

for (const mission of FLIGHT_MISSIONS) {
  test(`${mission.name}: all ordered beacons reachable, par attainable, completion freezes moves`, () => {
    let state = newFlight();
    for (const target of mission.beacons) {
      const route = flightRoute(mission, state.history.at(-1).position, target);
      assert.ok(route && route.length > 1);
      for (let i = 1; i < route.length; i++) {
        state = moveFlight(mission, state, [route[i][0] - route[i-1][0], route[i][1] - route[i-1][1]]);
      }
    }
    assert.equal(state.history.at(-1).collected, mission.beacons.length);
    assert.equal(state.history.length - 1, flightPar(mission));
    assert.equal(flightMedal(state.history.length - 1, flightPar(mission), false), 3);
    assert.equal(moveFlight(mission, state, [1, 0]), state);
  });
}
test('debris and bounds reject moves; non-thruster jumps are not allowed', () => {
  const mission = FLIGHT_MISSIONS[2];
  const state = newFlight();
  assert.equal(moveFlight(mission, state, [1, 0]), state);
  assert.equal(moveFlight(mission, state, [2, 2]), state);
  let edge = state;
  for (let i = 0; i < 4; i++) edge = moveFlight(mission, edge, [-1, 0]);
  assert.deepEqual(edge.history.at(-1).position, [-4, 0]);
  assert.equal(moveFlight(mission, edge, [-1, 0]), edge);
});
test('future beacons do not collect out of order; undo restores beacon state', () => {
  const mission = FLIGHT_MISSIONS[0];
  let state = newFlight();
  for (const delta of [[0, 1], [0, 1], [1, 0], [1, 0]]) state = moveFlight(mission, state, delta);
  assert.equal(state.history.at(-1).collected, 0);
  state = moveFlight(mission, moveFlight(mission, state, [0, -1]), [0, -1]);
  assert.equal(state.history.at(-1).collected, 1);
  assert.equal(state.history.slice(0, -1).at(-1).collected, 0);
});
test('medal boundaries, hints, and malformed stored data', () => {
  assert.equal(flightPar(FLIGHT_MISSIONS[0]), 4);
  assert.equal(flightPar(FLIGHT_MISSIONS[2]), 9);
  assert.equal(flightMedal(4, 4, true), 2);
  assert.equal(flightMedal(8, 4, false), 2);
  assert.equal(flightMedal(9, 4, false), 1);
  for (const value of [null, 'null', '[]', 'oops', '42']) assert.deepEqual(readFlightMedals(value), {});
  assert.deepEqual(readFlightMedals('{"launch":3,"slingshot":5,"debris":1.5,"unknown":2}'), {launch:3});
});
