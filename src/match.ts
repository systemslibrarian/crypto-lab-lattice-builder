import type { Vector } from "./lattice";

export type MatchBasis = { u: Vector; v: Vector };
export type MatchRound = { name: string; brief: string; lesson: string; reference: MatchBasis; options: MatchBasis[] };
const area = (b: MatchBasis) => b.u[0] * b.v[1] - b.u[1] * b.v[0];
const combine = (b: MatchBasis, a: number, c: number): Vector => [a * b.u[0] + c * b.v[0], a * b.u[1] + c * b.v[1]];

// Exact for our small, integral coordinates. Membership of both generators in
// both directions proves equality of the infinite lattices, not just the dots
// in the preview. Equal determinant alone would not prove this.
export function containsPoint(basis: MatchBasis, p: Vector): boolean {
  const d = area(basis);
  return d !== 0 && (p[0] * basis.v[1] - p[1] * basis.v[0]) % d === 0
    && (basis.u[0] * p[1] - basis.u[1] * p[0]) % d === 0;
}
export function sameLattice(a: MatchBasis, b: MatchBasis): boolean {
  return area(a) !== 0 && area(b) !== 0
    && containsPoint(a, b.u) && containsPoint(a, b.v)
    && containsPoint(b, a.u) && containsPoint(b, a.v);
}
export function matchReason(reference: MatchBasis, option: MatchBasis): string {
  if (sameLattice(reference, option)) return "Same dots, different directions. Each pair can rebuild the other using whole-number steps, so they generate exactly the same infinite lattice.";
  if (Math.abs(area(reference)) === Math.abs(area(option))) return "Same cell area, different dots! Equal area alone is not enough: these directions cannot rebuild both original arrows using whole-number steps.";
  if (containsPoint(reference, option.u) && containsPoint(reference, option.v)) return "This map skips some of the original dots. Its arrows land on the original lattice, but whole-number steps along them cannot reach every original dot.";
  return "This map adds or shifts dots. At least one of its arrows lands outside the original lattice, so it cannot describe the same set.";
}

// Invert the four corners to bound all coefficients that can appear inside the
// viewport. A fixed coefficient box would incorrectly hide dots for skew bases.
export function visibleMatchPoints(b: MatchBasis, extent = 120): Vector[] {
  const d = area(b);
  if (!d || !Number.isFinite(extent) || extent < 0 || extent > 200) return [];
  const corners = [[-extent, -extent], [-extent, extent], [extent, -extent], [extent, extent]];
  const as = corners.map(([x,y]) => (x * b.v[1] - y * b.v[0]) / d);
  const bs = corners.map(([x,y]) => (b.u[0] * y - b.u[1] * x) / d);
  const points: Vector[] = [];
  for (let a = Math.ceil(Math.min(...as)); a <= Math.floor(Math.max(...as)); a++) {
    for (let c = Math.ceil(Math.min(...bs)); c <= Math.floor(Math.max(...bs)); c++) {
      const p = combine(b, a, c);
      if (Math.abs(p[0]) <= extent && Math.abs(p[1]) <= extent) points.push(p);
    }
  }
  return points;
}
function changed(b: MatchBasis, u: Vector, v: Vector): MatchBasis {
  return { u: combine(b, ...u), v: combine(b, ...v) };
}
const BRIEFS = [
  ["Turn the map", "The arrows have changed. Which map still reaches every original dot, and no extra dots?", "Reversing or swapping arrows does not change the lattice. Negative steps are allowed."],
  ["Take a diagonal", "One navigator replaced a straight step with a diagonal. Can it still take you everywhere?", "Replacing V with U + V keeps the lattice: subtract U to recover the old V."],
  ["Missing stations", "Two maps quietly skip stations. Find the one that keeps the whole network connected.", "Landing on some original dots is not enough. A matching basis must reach every original dot."],
  ["Same area, new world", "An impostor has the same cell area as the original. Look at where the steps can actually land.", "Equal area is necessary for matching bases, but it is not sufficient. The whole-number relationship matters."],
  ["Long way around", "Long arrows can still describe the same tiny steps. Find the map with no missing stations.", "A long basis vector can be undone with negative steps. Arrow length alone does not decide the lattice."],
  ["Master cartographer", "One last map. Trust reachable dots, not how familiar the arrows look.", "Two bases describe the same lattice when the change-of-basis matrix has integer entries and determinant +1 or −1."],
];
export function makeMatchRounds(seed: number): MatchRound[] {
  let state = seed >>> 0;
  const rand = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const references: MatchBasis[] = [
    { u:[32,0], v:[0,32] }, { u:[32,0], v:[16,28] },
    { u:[28,8], v:[-8,28] }, { u:[24,12], v:[-12,24] },
  ];
  const transformations: [Vector,Vector][] = [[[0,1],[-1,0]], [[1,0],[1,1]], [[1,1],[0,1]], [[1,0],[-1,1]], [[2,1],[1,1]], [[1,2],[1,1]]];
  return BRIEFS.map(([name,brief,lesson], index) => {
    const reference = references[Math.floor(rand() * references.length)];
    const correct = changed(reference, ...transformations[index]);
    const sparse = changed(reference, [2,0], [0,1]);
    const decoy = index < 3 ? changed(reference, [1,0], [0,2]) : changed(reference, [1,0.5], [0,1]);
    const options = [correct, sparse, decoy];
    for (let i = options.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [options[i], options[j]] = [options[j], options[i]]; }
    return { name, brief, lesson, reference, options };
  });
}
export function matchStars(misses: number, lens: boolean): number {
  return misses > 0 ? 1 : lens ? 2 : 3;
}
export function parseMatchSeed(raw: string | null): number {
  return raw !== null && /^\d{1,9}$/.test(raw) && Number(raw) > 0 ? Number(raw) : 1;
}
export function parseMatchBest(raw: string | null): number {
  return raw !== null && /^\d{1,2}$/.test(raw) && Number(raw) <= 18 ? Number(raw) : 0;
}
