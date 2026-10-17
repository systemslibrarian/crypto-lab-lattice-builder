import type { Vector } from "./lattice";

export type FlightMission = {
  id: string;
  name: string;
  brief: string;
  lesson: string;
  u: Vector;
  v: Vector;
  beacons: Vector[];
  rocks: Vector[];
};
export const FLIGHT_LIMIT = 4;
export const THRUSTERS: { label: string; key: string; delta: Vector }[] = [
  { label: "+ U", key: "w", delta: [1, 0] },
  { label: "− U", key: "s", delta: [-1, 0] },
  { label: "+ V", key: "d", delta: [0, 1] },
  { label: "− V", key: "a", delta: [0, -1] },
];
export const FLIGHT_MISSIONS: FlightMission[] = [
  { id: "launch", lesson: "You reached the beacons by adding whole-number steps of U and V. Those integer combinations are what make these landing points a lattice.", name: "First flight", brief: "Your ship has two thrusters. Each tap takes one whole step. Reach beacon 1, then beacon 2.", u: [1, 0], v: [0, 1], beacons: [[2, 0], [2, 2]], rocks: [] },
  { id: "slingshot", lesson: "The slanted V thruster changed both screen coordinates at once. Negative thrust subtracts the same vector; the lattice still comes from whole-number combinations of U and V.", name: "Slingshot", brief: "The V thruster now points diagonally. Follow its arrow, not your old idea of up. Negative thrust brings you back.", u: [1, 0], v: [0.65, 1], beacons: [[-1, 2], [2, -1]], rocks: [] },
  { id: "debris", lesson: "You detoured around forbidden landing points. The shortest permitted route here counts thruster taps on a finite board; it is not the shortest lattice vector or a cryptographic attack.", name: "Debris run", brief: "Blocked landing points ahead. Fly around the marked debris and reconnect both beacons. Bumps do not cost a move.", u: [1, 0.2], v: [-0.25, 1], beacons: [[3, 0], [1, 2]], rocks: [[1, 0], [2, 0], [2, 1]] },
  { id: "crossing", lesson: "You combined two slanted basis directions to reach the beacons. Coordinates count steps along the basis vectors, even when those directions do not look like ordinary horizontal and vertical axes.", name: "Crossing currents", brief: "Two slanted directions, three stranded beacons. Find a route through the gaps; undo is always free.", u: [1, 0.3], v: [0.7, 1], beacons: [[-2, 2], [2, 1], [0, -2]], rocks: [[-1, 0], [-1, 1], [0, 2], [1, 1], [1, -1]] },
  { id: "needle", lesson: "Opposite steps along similar directions can cancel much of each other. This is why long basis vectors can combine into a shorter vector; the game illustrates that geometry without solving a cryptographic instance.", name: "Thread the needle", brief: "The thrusters point almost the same way. Opposite thrusts can make a small sideways step. Try it.", u: [1, 0.15], v: [0.8, 0.65], beacons: [[2, -2], [-2, 2], [1, 1]], rocks: [[1, -1], [0, 1], [-1, 1]] },
  { id: "home", lesson: "Your steps added up to zero when you returned HOME. Adding or subtracting whole basis vectors keeps you on the lattice. Your medal measures this navigation route, not cryptographic security.", name: "Bring them home", brief: "Reconnect the outer beacons, then return to HOME. Every point is still a whole-number combination of U and V.", u: [1, 0.35], v: [-0.5, 1], beacons: [[3, 2], [-2, -2], [0, 0]], rocks: [[1, 0], [1, 1], [2, 1], [0, -1], [-1, -1], [-1, 0]] },
];
export function samePoint(a: Vector, b: Vector): boolean {
  return a[0] === b[0] && a[1] === b[1];
}
export function canLand(mission: FlightMission, point: Vector): boolean {
  return point.every(n => Number.isInteger(n) && Math.abs(n) <= FLIGHT_LIMIT)
    && !mission.rocks.some(rock => samePoint(rock, point));
}
// Shortest number of permitted thruster taps on this finite board. This is a
// graph route, NOT a shortest-vector algorithm or a cryptographic attack.
export function flightRoute(mission: FlightMission, start: Vector, goal: Vector): Vector[] | null {
  if (!canLand(mission, start) || !canLand(mission, goal)) return null;
  const queue: Vector[][] = [[start]];
  const seen = new Set([start.join(",")]);
  for (let i = 0; i < queue.length; i++) {
    const path = queue[i];
    const current = path[path.length - 1];
    if (samePoint(current, goal)) return path;
    for (const { delta } of THRUSTERS) {
      const next: Vector = [current[0] + delta[0], current[1] + delta[1]];
      if (!canLand(mission, next) || seen.has(next.join(","))) continue;
      seen.add(next.join(","));
      queue.push([...path, next]);
    }
  }
  return null;
}
export function flightPar(mission: FlightMission): number {
  let start: Vector = [0, 0];
  let total = 0;
  for (const beacon of mission.beacons) {
    const path = flightRoute(mission, start, beacon);
    if (!path) throw new Error(`Unreachable beacon in ${mission.id}`);
    total += path.length - 1;
    start = beacon;
  }
  return total;
}
export type FlightSnapshot = { position: Vector; collected: number };
export type FlightState = { history: FlightSnapshot[]; hinted: boolean };
export function newFlight(): FlightState {
  return { history: [{ position: [0, 0], collected: 0 }], hinted: false };
}
export function moveFlight(mission: FlightMission, state: FlightState, delta: Vector): FlightState {
  const current = state.history[state.history.length - 1];
  if (current.collected === mission.beacons.length || !THRUSTERS.some(t => samePoint(t.delta, delta))) return state;
  const next: Vector = [current.position[0] + delta[0], current.position[1] + delta[1]];
  if (!canLand(mission, next)) return state;
  const collected = current.collected + (samePoint(next, mission.beacons[current.collected]) ? 1 : 0);
  return { ...state, history: [...state.history, { position: next, collected }] };
}
export function flightMedal(moves: number, par: number, hinted: boolean): number {
  return !hinted && moves === par ? 3 : moves <= par + 4 ? 2 : 1;
}
export const MEDALS = ["Unplayed", "Bronze", "Silver", "Gold"];
export function readFlightMedals(raw: string | null): Record<string, number> {
  try {
    const data: unknown = JSON.parse(raw ?? "{}");
    if (!data || typeof data !== "object" || Array.isArray(data)) return {};
    return Object.fromEntries(FLIGHT_MISSIONS.flatMap(m => {
      const value = (data as Record<string, unknown>)[m.id];
      return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 3 ? [[m.id, value]] : [];
    }));
  } catch { return {}; }
}
