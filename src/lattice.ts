export type Vector = [number, number];

export type Level = {
  name: string;
  codename: string;
  brief: string;
  targetTwist: number;
  targetProjection: number;
  initialTwist: number;
  initialProjection: number;
  basisU: Vector;
  basisV: Vector;
  seed: number;
  noise: number;
};

export const CANDIDATES: Vector[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
  [-1, -1],
];

export const DIRECTIONS: Vector[] = [
  [1, 0],
  [0, 1],
  [1, -1],
  [1, 1],
];

export const CAMPAIGN_LEVELS: Level[] = [
  {
    name: "First light",
    codename: "FIELD 01",
    brief: "The rows are only lightly bent. Straighten them, then take the dot nearest HOME.",
    targetTwist: 8,
    targetProjection: 62,
    initialTwist: -24,
    initialProjection: 18,
    basisU: [68, 10],
    basisV: [42, 55],
    seed: 3,
    noise: 22,
  },
  {
    name: "Crosswind",
    codename: "FIELD 02",
    brief: "A harder lean this time. Work both dials, then find which dot sits closest to HOME.",
    targetTwist: -13,
    targetProjection: 38,
    initialTwist: 22,
    initialProjection: 78,
    basisU: [70, 34],
    basisV: [-4, 50],
    seed: 8,
    noise: 29,
  },
  {
    name: "Deep fog",
    codename: "FIELD 03",
    brief: "The grid is almost buried. Straighten it anyway, then measure your way to the nearest dot.",
    targetTwist: 17,
    targetProjection: 74,
    initialTwist: -17,
    initialProjection: 26,
    basisU: [78, 4],
    basisV: [48, 60],
    seed: 15,
    noise: 36,
  },
];

export function sameDirection(a: Vector, b: Vector): boolean {
  return (
    (a[0] === b[0] && a[1] === b[1]) || (a[0] === -b[0] && a[1] === -b[1])
  );
}

export function latticeLength(vec: Vector, u: Vector, v: Vector): number {
  const x = vec[0] * u[0] + vec[1] * v[0];
  const y = vec[0] * u[1] + vec[1] * v[1];
  return Math.hypot(x, y);
}

export function shortestOf(u: Vector, v: Vector): Vector {
  let best = DIRECTIONS[0];
  let bestLength = latticeLength(best, u, v);
  for (let i = 1; i < DIRECTIONS.length; i += 1) {
    const candidate = DIRECTIONS[i];
    const length = latticeLength(candidate, u, v);
    if (length < bestLength) {
      best = candidate;
      bestLength = length;
    }
  }
  return [best[0], best[1]];
}

export function marginOf(u: Vector, v: Vector): number {
  const lengths = DIRECTIONS.map((d) => latticeLength(d, u, v)).sort(
    (a, b) => a - b,
  );
  const shortest = lengths[0];
  if (shortest <= 0) return 0;
  return (lengths[1] - shortest) / shortest;
}

export function todayKey(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Deterministic generator ---------------------------------------------------

const DAILY_NOISE = [22, 29, 36];
const DAILY_MIN_MARGIN = [0.28, 0.24, 0.18];
const MAX_MARGIN = 0.9;
const BASIS_ATTEMPTS = 400;
const MIN_BASIS_LENGTH = 45;
const MAX_BASIS_LENGTH = 90;
const MIN_DETERMINANT = 2200;
const TWIST_LIMIT = 30;
const PROJECTION_LIMIT = 100;

// The winning direction is drawn uniformly from these and then enforced by
// rejection, so no direction can be guessed without reading the field.
const WINNING_DIRECTIONS: Vector[] = [
  [1, 0],
  [0, 1],
  [1, -1],
];

const DAILY_NAMES = [
  "Static bloom",
  "Cold aperture",
  "Iron meridian",
  "Glass weather",
  "Salt lantern",
  "Pale quarry",
  "Slow ember",
  "Blue interval",
  "Dust harbor",
  "Quiet ledger",
  "Amber drift",
  "Long shutter",
  "Tin horizon",
  "Night ballast",
];

const DAILY_BRIEFS = [
  [
    "The rows are only lightly bent. Straighten them, then take the dot nearest HOME.",
    "An easy drift today. Bring the grid back to square, then find the closest dot to HOME.",
    "Barely bent. Straighten the rows and the nearest dot should be plain enough.",
  ],
  [
    "A harder lean this time. Work both dials, then find which dot sits closest to HOME.",
    "The grid leans away from you. Hold it square before you trust any distance.",
    "Something crosses this grid. Straighten it, then measure before you take a dot.",
  ],
  [
    "The grid is almost buried. Straighten it anyway, then measure your way to the nearest dot.",
    "Little is left above the jitter. Trust the measurements here, not your eye.",
    "This one hides inside its own static. Find the square view, then the closest dot to HOME.",
  ],
];

function hashKey(key: string): number {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(rand: () => number, min: number, max: number): number {
  return min + Math.floor(rand() * (max - min + 1));
}

function acceptableBasis(
  u: Vector,
  v: Vector,
  minMargin: number,
  want: Vector | null,
): boolean {
  const lengthU = Math.hypot(u[0], u[1]);
  const lengthV = Math.hypot(v[0], v[1]);
  if (lengthU < MIN_BASIS_LENGTH || lengthU > MAX_BASIS_LENGTH) return false;
  if (lengthV < MIN_BASIS_LENGTH || lengthV > MAX_BASIS_LENGTH) return false;
  if (Math.abs(u[0] * v[1] - u[1] * v[0]) < MIN_DETERMINANT) return false;
  const shortest = shortestOf(u, v);
  if (shortest[0] === 1 && shortest[1] === 1) return false;
  if (want && (shortest[0] !== want[0] || shortest[1] !== want[1])) return false;
  const margin = marginOf(u, v);
  return margin >= minMargin && margin <= MAX_MARGIN;
}

// Only reachable if 400 samples all fail; scan the hand-tuned bases for one
// that still satisfies this tier so the margin rule can never be broken.
function fallbackBasis(
  tier: number,
  minMargin: number,
  want: Vector,
): [Vector, Vector] {
  for (const target of [want, null]) {
    for (let i = 0; i < CAMPAIGN_LEVELS.length; i += 1) {
      const level = CAMPAIGN_LEVELS[(tier + i) % CAMPAIGN_LEVELS.length];
      if (acceptableBasis(level.basisU, level.basisV, minMargin, target)) {
        return [
          [level.basisU[0], level.basisU[1]],
          [level.basisV[0], level.basisV[1]],
        ];
      }
    }
  }
  const level = CAMPAIGN_LEVELS[0];
  return [
    [level.basisU[0], level.basisU[1]],
    [level.basisV[0], level.basisV[1]],
  ];
}

function pickBasis(
  rand: () => number,
  tier: number,
  minMargin: number,
): [Vector, Vector] {
  const want = WINNING_DIRECTIONS[randInt(rand, 0, WINNING_DIRECTIONS.length - 1)];
  for (let attempt = 0; attempt < BASIS_ATTEMPTS; attempt += 1) {
    const u: Vector = [randInt(rand, 34, 82), randInt(rand, -6, 38)];
    const v: Vector = [randInt(rand, -14, 58), randInt(rand, 40, 72)];
    if (acceptableBasis(u, v, minMargin, want)) return [u, v];
  }
  return fallbackBasis(tier, minMargin, want);
}

function pickInitial(
  rand: () => number,
  target: number,
  gap: number,
  min: number,
  max: number,
): number {
  const low = target - gap;
  const high = target + gap;
  const lowOk = low >= min;
  const highOk = high <= max;
  if (lowOk && highOk) return rand() < 0.5 ? low : high;
  if (lowOk) return low;
  return high;
}

export function makeDailyLevels(key: string): Level[] {
  const rand = mulberry32(hashKey(key));
  const names = DAILY_NAMES.slice();
  const levels: Level[] = [];

  for (let tier = 0; tier < 3; tier += 1) {
    const minMargin = DAILY_MIN_MARGIN[tier];
    const [basisU, basisV] = pickBasis(rand, tier, minMargin);
    const targetTwist = randInt(rand, -25, 25);
    const targetProjection = randInt(rand, 25, 80);
    const initialTwist = pickInitial(
      rand,
      targetTwist,
      randInt(rand, 25, 30),
      -TWIST_LIMIT,
      TWIST_LIMIT,
    );
    const initialProjection = pickInitial(
      rand,
      targetProjection,
      randInt(rand, 30, 40),
      0,
      PROJECTION_LIMIT,
    );
    const name = names.splice(randInt(rand, 0, names.length - 1), 1)[0];
    const briefs = DAILY_BRIEFS[tier];

    levels.push({
      name,
      codename: `FIELD 0${tier + 1}`,
      brief: briefs[randInt(rand, 0, briefs.length - 1)],
      targetTwist,
      targetProjection,
      initialTwist,
      initialProjection,
      basisU,
      basisV,
      seed: randInt(rand, 1, 99991),
      noise: DAILY_NOISE[tier],
    });
  }

  return levels;
}
