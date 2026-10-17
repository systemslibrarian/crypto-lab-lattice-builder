export type Point = [number, number];
export type Action = 'a+' | 'a-' | 'b+' | 'b-' | 'trim' | 'extend';
export type Chart = { name: string; start: Point; dock: Point; beacons: Point[]; rocks: Point[] };
export type Frame = { position: Point; collected: number; shear: number; jumps: number; refits: number };
export const ACTIONS: Action[] = ['a+', 'a-', 'b+', 'b-', 'trim', 'extend'];
export const LABELS: Record<Action, string> = { 'a+': '+ A', 'a-': '− A', 'b+': '+ B', 'b-': '− B', trim: 'B − A', extend: 'B + A' };
export const STORE = 'lb:beacon-run:v1';
const BASE: Chart[] = [
  { name: 'Neon shortcut', start: [-4, 0], dock: [6, 0], beacons: [[-2, 2], [2, -2], [4, 2]], rocks: [[0, 0], [2, 2], [-2, -2]] },
  { name: 'Orbit hop', start: [-4, -2], dock: [4, 0], beacons: [[-4, 2], [0, 4], [4, -2]], rocks: [[-2, 0], [0, 2], [2, -2]] },
  { name: 'Cross the gap', start: [-6, 0], dock: [6, -2], beacons: [[-2, -4], [0, 2], [4, 4]], rocks: [[-2, 0], [0, 0], [2, 0], [2, 2]] },
];
// Six authored charts, including their vertical reflections. No security RNG.
export function chart(index: number): Chart {
  const i = ((Math.trunc(index) % 6) + 6) % 6;
  const base = BASE[i % 3];
  const point = (p: Point): Point => [p[0], i < 3 ? p[1] : -p[1]];
  return { name: base.name + (i < 3 ? '' : ' · reflected'), start: point(base.start), dock: point(base.dock), beacons: base.beacons.map(point), rocks: base.rocks.map(point) };
}
export const same = (a: Point, b: Point) => a[0] === b[0] && a[1] === b[1];
export const basis = (shear: number): [Point, Point] => [[2, 0], [2 * shear, 2]];
export function coordinates(p: Point, shear: number): Point {
  return [(p[0] - shear * p[1]) / 2, p[1] / 2];
}
export function canLand(c: Chart, p: Point): boolean {
  return p.every(n => Number.isInteger(n) && n % 2 === 0) && Math.abs(p[0]) <= 6 && Math.abs(p[1]) <= 4 && !c.rocks.some(r => same(p, r));
}
export function initial(c: Chart): Frame { return { position: [...c.start], collected: 0, shear: 1, jumps: 0, refits: 0 }; }
export function won(c: Chart, s: Frame): boolean { return s.collected === 7 && same(s.position, c.dock); }
export function landing(s: Frame, action: Action): Point {
  const [a, b] = basis(s.shear);
  const v = action[0] === 'a' ? a : b;
  const sign = action.endsWith('+') ? 1 : -1;
  return [s.position[0] + sign * v[0], s.position[1] + sign * v[1]];
}
export function advance(c: Chart, s: Frame, action: Action): Frame {
  if (won(c, s) || !ACTIONS.includes(action)) return s;
  if (action === 'trim' || action === 'extend') {
    const shear = s.shear + (action === 'trim' ? -1 : 1);
    return shear < -1 || shear > 2 ? s : { ...s, shear, refits: s.refits + 1 };
  }
  const position = landing(s, action);
  if (!canLand(c, position)) return s;
  const index = c.beacons.findIndex(p => same(p, position));
  return { ...s, position, collected: index < 0 ? s.collected : s.collected | (1 << index), jumps: s.jumps + 1 };
}
// Small finite graph search for an attainable route target and free hints.
// One jump OR refit is one command. This is not lattice reduction or SVP.
export function route(c: Chart, start: Frame): Action[] | null {
  const key = (s: Frame) => `${s.position}:${s.collected}:${s.shear}`;
  const queue = [{ frame: start, path: [] as Action[] }];
  const seen = new Set([key(start)]);
  for (let head = 0; head < queue.length; head++) {
    const { frame, path } = queue[head];
    if (won(c, frame)) return path;
    for (const action of ACTIONS) {
      const next = advance(c, frame, action);
      const id = key(next);
      if (next === frame || seen.has(id)) continue;
      seen.add(id); queue.push({ frame: next, path: [...path, action] });
    }
  }
  return null;
}
export function readProgress(raw: string | null): { best: (number | null)[]; sound: boolean } {
  let value: { best?: unknown; sound?: unknown } = {};
  try { const parsed = JSON.parse(raw ?? 'null'); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) value = parsed; } catch { /* no saved record */ }
  const best = Array.isArray(value.best) ? value.best : [];
  return { best: Array.from({ length: 6 }, (_, i) => Number.isSafeInteger(best[i]) && best[i] > 0 && best[i] < 10000 ? best[i] : null), sound: value.sound === true };
}
