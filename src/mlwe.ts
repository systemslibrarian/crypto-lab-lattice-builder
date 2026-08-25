// A Module-LWE instance with exactly the shape ML-KEM uses — R_q = Z_q[X]/(X^n+1),
// small secret, small error, public (A, t = A·s + e) — but at parameters small
// enough that a visitor can actually break it. The point of the exercise is the
// contrast: the same construction at n=256 is ML-KEM-512.

export type ToyParams = {
  label: string;
  n: number;
  k: number;
  q: number;
  eta: number;
  real?: boolean;
};

// Each rung keeps the construction identical and only turns the numbers up.
export const LADDER: ToyParams[] = [
  { label: "BREAKABLE", n: 4, k: 2, q: 29, eta: 1 },
  { label: "STRETCH", n: 8, k: 2, q: 97, eta: 2 },
  { label: "NO CHANCE", n: 16, k: 2, q: 257, eta: 2 },
  { label: "ABSURD", n: 32, k: 2, q: 769, eta: 2 },
  { label: "ML-KEM-512", n: 256, k: 2, q: 3329, eta: 3, real: true },
];

export type Poly = number[];
export type Instance = {
  params: ToyParams;
  a: Poly[][];
  t: Poly[];
  s: Poly[];
  secretCode: number;
};

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeOps(p: ToyParams) {
  const { n, q } = p;
  const mod = (x: number) => ((x % q) + q) % q;
  // centred lift: the representative in (-q/2, q/2], which is what "small" means
  const centre = (x: number) => { const c = mod(x); return c > q / 2 ? c - q : c; };
  const mul = (a: Poly, b: Poly): Poly => {
    const r = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) {
        let idx = i + j;
        let v = a[i] * b[j];
        if (idx >= n) { idx -= n; v = -v; }   // X^n = -1
        r[idx] = mod(r[idx] + v);
      }
    }
    return r;
  };
  const add = (a: Poly, b: Poly): Poly => a.map((x, i) => mod(x + b[i]));
  const sub = (a: Poly, b: Poly): Poly => a.map((x, i) => mod(x - b[i]));
  const dot = (row: Poly[], vec: Poly[]): Poly => {
    let acc = new Array<number>(n).fill(0);
    for (let i = 0; i < row.length; i += 1) acc = add(acc, mul(row[i], vec[i]));
    return acc;
  };
  return { mod, centre, mul, add, sub, dot };
}

export function makeInstance(p: ToyParams, seed: number): Instance {
  const { n, k, q, eta } = p;
  const ops = makeOps(p);
  const rand = mulberry32(seed);
  const uniform = (): Poly => Array.from({ length: n }, () => Math.floor(rand() * q));
  const small = (): Poly => Array.from({ length: n }, () => {
    let acc = 0;
    for (let i = 0; i < eta; i += 1) acc += (rand() < 0.5 ? 1 : 0) - (rand() < 0.5 ? 1 : 0);
    return ops.mod(acc);
  });

  const a = Array.from({ length: k }, () => Array.from({ length: k }, uniform));
  const s = Array.from({ length: k }, small);
  const e = Array.from({ length: k }, small);
  // t_i = <a_i, s> + e_i
  const t = Array.from({ length: k }, (_, i) => ops.add(ops.dot(a[i], s), e[i]));

  return { params: p, a, t, s, secretCode: codeOfSecret(s, p) };
}

// A candidate secret is n*k coefficients each drawn from {-eta..eta}, so the whole
// space is a single base-(2*eta+1) integer. That is what makes exhaustive search
// expressible as a counter, and what makes its size so easy to state.
export function alphabet(p: ToyParams) { return 2 * p.eta + 1; }

export function candidateFromCode(code: number, p: ToyParams): Poly[] {
  const base = alphabet(p);
  const ops = makeOps(p);
  const flat: number[] = [];
  let c = code;
  for (let i = 0; i < p.n * p.k; i += 1) { flat.push((c % base) - p.eta); c = Math.floor(c / base); }
  const out: Poly[] = [];
  for (let i = 0; i < p.k; i += 1) out.push(flat.slice(i * p.n, (i + 1) * p.n).map(ops.mod));
  return out;
}

export function codeOfSecret(s: Poly[], p: ToyParams): number {
  const base = alphabet(p);
  const ops = makeOps(p);
  let code = 0;
  let place = 1;
  for (let i = 0; i < p.k; i += 1) {
    for (let j = 0; j < p.n; j += 1) {
      code += (ops.centre(s[i][j]) + p.eta) * place;
      place *= base;
    }
  }
  return code;
}

// ||t - A·s'||, the only feedback an attacker gets. Measured flat: see the
// exhibit copy — every wrong candidate scores about the same, however close it is.
export function residual(inst: Instance, candidate: Poly[]): number {
  const ops = makeOps(inst.params);
  let acc = 0;
  for (let i = 0; i < inst.params.k; i += 1) {
    const diff = ops.sub(inst.t[i], ops.dot(inst.a[i], candidate));
    for (const x of diff) { const c = ops.centre(x); acc += c * c; }
  }
  return Math.sqrt(acc);
}

export function spaceLog10(p: ToyParams): number {
  return p.n * p.k * Math.log10(alphabet(p));
}

export function spaceExact(p: ToyParams): number | null {
  const log = spaceLog10(p);
  return log < 15 ? Math.round(alphabet(p) ** (p.n * p.k)) : null;
}

export function formatSpace(p: ToyParams): string {
  const exact = spaceExact(p);
  if (exact !== null) return exact.toLocaleString("en-US");
  return `10^${Math.round(spaceLog10(p))}`;
}

// Seconds to grind the whole space at a measured rate. Everything is done in
// log10 because the last rung overflows a double long before it overflows the
// reader's patience.
const YEAR_SECONDS = 31557600;
const UNIVERSE_SECONDS = 4.35e17; // ~13.8 billion years

function power(log: number, unit: string): string {
  if (log < 6) {
    const v = 10 ** log;
    return `${v.toLocaleString("en-US", { maximumFractionDigits: v < 10 ? 1 : 0 })} ${unit}`;
  }
  return `10^${Math.round(log)} ${unit}`;
}

export function formatEta(p: ToyParams, perSecond: number): string {
  if (perSecond <= 0) return "\u2014";
  const log = spaceLog10(p) - Math.log10(perSecond);
  const seconds = 10 ** log;
  if (log < 0) return "instant";
  if (seconds < 60) return `${seconds.toFixed(1)} seconds`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)} minutes`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)} hours`;
  if (seconds < YEAR_SECONDS) return `${(seconds / 86400).toFixed(1)} days`;
  const yearsLog = log - Math.log10(YEAR_SECONDS);
  const universeLog = log - Math.log10(UNIVERSE_SECONDS);
  if (universeLog < 0.5) return power(yearsLog, "years");
  return `${power(universeLog, "\u00d7").replace(" \u00d7", "\u00d7")} the age of the universe`;
}
