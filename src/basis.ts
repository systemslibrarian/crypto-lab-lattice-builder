// Two descriptions of one 2D lattice, for the expert section.
//
// The point being made: a lattice is a set of points, and a basis is only a way
// of naming them. B = U*G with det(U) = 1 generates exactly the same points as G,
// but if U is chosen badly the basis vectors come out long and nearly parallel,
// and short vectors stop being reachable in one step. That is the whole trapdoor
// intuition, and it is visible in two dimensions.

export type Vec = [number, number];
export type Basis = { name: string; u: Vec; v: Vec };

export const SECRET: Basis = { name: "SECRET", u: [30, 4], v: [6, 31] };

// U = [[7,5],[4,3]], det = 1
const U: [Vec, Vec] = [[7, 5], [4, 3]];
export const PUBLIC: Basis = {
  name: "PUBLIC",
  u: [U[0][0] * SECRET.u[0] + U[0][1] * SECRET.v[0], U[0][0] * SECRET.u[1] + U[0][1] * SECRET.v[1]],
  v: [U[1][0] * SECRET.u[0] + U[1][1] * SECRET.v[0], U[1][0] * SECRET.u[1] + U[1][1] * SECRET.v[1]],
};

// The shortest vector expressed in each basis. In SECRET it is one step; in
// PUBLIC it needs (3, -5), which no amount of looking at the eight neighbours finds.
export const SHORTEST_IN_PUBLIC: Vec = [3, -5];

export const len = (a: Vec) => Math.hypot(a[0], a[1]);
export const combine = (b: Basis, i: number, j: number): Vec => [i * b.u[0] + j * b.v[0], i * b.u[1] + j * b.v[1]];
export const det = (b: Basis) => b.u[0] * b.v[1] - b.u[1] * b.v[0];

export function angleBetween(b: Basis) {
  const dot = b.u[0] * b.v[0] + b.u[1] * b.v[1];
  return (Math.acos(dot / (len(b.u) * len(b.v))) * 180) / Math.PI;
}

// The eight one-step neighbours: every non-zero (i,j) with i,j in {-1,0,1}.
// 3^2 - 1 = 8, which is exactly the count that generalises to 3^d - 1.
export const STEPS: Vec[] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1], [1, 1], [-1, -1]];

export function neighbours(b: Basis) {
  return STEPS.map((s) => ({ step: s, vec: combine(b, s[0], s[1]) }))
    .map((n) => ({ ...n, length: len(n.vec) }))
    .sort((x, y) => x.length - y.length);
}

export function shortestVisible(b: Basis) {
  return neighbours(b)[0];
}

// Brute force the genuine shortest non-zero lattice vector, so the page never
// has to take the claim on trust.
export function trueShortest(b: Basis, reach = 40) {
  let best: { vec: Vec; ij: Vec; length: number } | null = null;
  for (let i = -reach; i <= reach; i += 1) {
    for (let j = -reach; j <= reach; j += 1) {
      if (i === 0 && j === 0) continue;
      const vec = combine(b, i, j);
      const l = len(vec);
      if (!best || l < best.length) best = { vec, ij: [i, j], length: l };
    }
  }
  return best!;
}

// Babai rounding: write the target in the basis's own coordinates, round each to
// a whole number, and rebuild. With short near-orthogonal vectors this lands on
// the nearest lattice point; with long skewed ones it misses badly. Same lattice,
// same algorithm -- this is why holding the good description is worth something.
export function babai(b: Basis, target: Vec) {
  const d = det(b);
  const x = (target[0] * b.v[1] - target[1] * b.v[0]) / d;
  const y = (-target[0] * b.u[1] + target[1] * b.u[0]) / d;
  const i = Math.round(x);
  const j = Math.round(y);
  return { ij: [i, j] as Vec, point: combine(b, i, j) };
}

export type DecodeTrial = {
  target: Vec;
  truth: Vec;
  offset: Vec;
  secret: Vec;
  publicGuess: Vec;
  secretOk: boolean;
  publicOk: boolean;
};

export function decodeTrial(seedIndex: number): DecodeTrial {
  const i = ((seedIndex * 7) % 9) - 4;
  const j = ((seedIndex * 13) % 9) - 4;
  const truth = combine(SECRET, i, j);
  const offset: Vec = [((seedIndex * 5) % 9) - 4, ((seedIndex * 11) % 9) - 4];
  const target: Vec = [truth[0] + offset[0], truth[1] + offset[1]];
  const s = babai(SECRET, target).point;
  const p = babai(PUBLIC, target).point;
  return {
    target, truth, offset, secret: s, publicGuess: p,
    secretOk: s[0] === truth[0] && s[1] === truth[1],
    publicOk: p[0] === truth[0] && p[1] === truth[1],
  };
}

// 3^d - 1 one-step neighbours in d dimensions. The eight dots are the d=2 case.
export const DIMENSIONS = [2, 3, 4, 8, 16, 64, 512];
export function neighbourCount(d: number): string {
  const log = d * Math.log10(3);
  if (log < 15) return (3 ** d - 1).toLocaleString("en-US");
  return `10^${Math.round(log)}`;
}
