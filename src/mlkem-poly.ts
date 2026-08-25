/**
 * ML-KEM (FIPS 203) polynomial arithmetic core.
 *
 * Scope: rings, NTT, sampling, compression and byte packing only. There is
 * deliberately NO hashing in this file — SHAKE/SHA3 live in `keccak.ts`, and a
 * third module wires the two together into KeyGen/Encaps/Decaps.
 *
 * ---------------------------------------------------------------------------
 * REPRESENTATION INVARIANT (read this before touching anything)
 * ---------------------------------------------------------------------------
 * Every coefficient produced by every function here is a *canonical* residue in
 * [0, q). There is no Montgomery domain, no "signed small" domain, no lazy
 * reduction — one representation, everywhere, always. Mixed domains are the
 * classic ML-KEM footgun, so the choice here is to make the domain question
 * unaskable rather than to shave microseconds off an exhibit that only needs
 * milliseconds.
 *
 * Functions are additionally *tolerant on input*: they canonicalise whatever
 * Int16 representative they are handed before using it, so a caller that hands
 * over centred values (e.g. -1) still gets the right answer.
 *
 * Products are computed with plain `%`. The largest intermediate anywhere is
 * about 3328 * 3328 * ... well under 2^53, so IEEE-754 doubles represent every
 * intermediate exactly and `%` is exact integer remainder. This is the whole
 * reduction strategy: exactness by construction.
 */

export const N = 256;
export const Q = 3329;

/** A degree-255 polynomial in Z_q[X]/(X^256+1), 256 coefficients in [0, q). */
export type Poly = Int16Array;

/** A vector of k polynomials. */
export type PolyVec = Poly[];

export type ParamSet = {
  name: "ML-KEM-512" | "ML-KEM-768" | "ML-KEM-1024";
  k: number;
  eta1: number;
  eta2: number;
  du: number;
  dv: number;
};

export const PARAMS: Record<"512" | "768" | "1024", ParamSet> = {
  "512": { name: "ML-KEM-512", k: 2, eta1: 3, eta2: 2, du: 10, dv: 4 },
  "768": { name: "ML-KEM-768", k: 3, eta1: 2, eta2: 2, du: 10, dv: 4 },
  "1024": { name: "ML-KEM-1024", k: 4, eta1: 2, eta2: 2, du: 11, dv: 5 },
};

/**
 * zeta = 17 is a primitive 256th root of unity mod 3329, i.e. 17^256 = 1 and
 * 17^128 = -1 = 3328. That second fact is what makes X^256+1 split: since
 * X^256 + 1 = X^256 - 17^128, the modulus factors into 128 quadratics
 *
 *     X^2 - 17^(2*BitRev7(i)+1)      for i = 0..127
 *
 * and NOT into 256 linears (that would need a primitive *512th* root, which
 * does not exist mod 3329 because 512 does not divide q-1 = 3328 = 2^8 * 13).
 * Hence the NTT stops one layer early and the transform of a polynomial is 128
 * degree-1 polynomials, packed as adjacent coefficient pairs (2i, 2i+1).
 */
const ZETA = 17;

/** Reverse the low 7 bits of i — the NTT's twiddle-factor ordering. */
function bitRev7(i: number): number {
  let r = 0;
  for (let b = 0; b < 7; b++) {
    r |= ((i >> b) & 1) << (6 - b);
  }
  return r;
}

/** ZETA^e mod Q for e in [0, 256). */
const ZETA_POW: Int16Array = (() => {
  const t = new Int16Array(256);
  let acc = 1;
  for (let e = 0; e < 256; e++) {
    t[e] = acc;
    acc = (acc * ZETA) % Q;
  }
  return t;
})();

/** Butterfly twiddles: ZETAS[i] = zeta^BitRev7(i), i in [0, 128). */
const ZETAS: Int16Array = (() => {
  const t = new Int16Array(128);
  for (let i = 0; i < 128; i++) {
    t[i] = ZETA_POW[bitRev7(i)];
  }
  return t;
})();

/**
 * Basemul twiddles: GAMMAS[i] = zeta^(2*BitRev7(i)+1) — the constant defining
 * the i-th quadratic X^2 - GAMMAS[i]. Note 2*BitRev7(i)+1 <= 255, so no wrap.
 */
const GAMMAS: Int16Array = (() => {
  const t = new Int16Array(128);
  for (let i = 0; i < 128; i++) {
    t[i] = ZETA_POW[(2 * bitRev7(i) + 1) & 0xff];
  }
  return t;
})();

/** 128^-1 mod 3329, the final scaling in the inverse NTT (128 * 3303 = 127q + 1). */
const N_INV = 3303;

/** Canonicalise an arbitrary integer representative into [0, q). */
function canon(x: number): number {
  const r = x % Q;
  return r < 0 ? r + Q : r;
}

export function polyNew(): Poly {
  return new Int16Array(N);
}

/** Reduce every coefficient into [0, q), in place. */
export function polyReduce(p: Poly): void {
  for (let i = 0; i < N; i++) {
    p[i] = canon(p[i]);
  }
}

/**
 * Forward NTT, in place (FIPS 203 Algorithm 9).
 *
 * `len` walks 128, 64, ... down to 2 and stops there — the missing len=1 layer
 * is exactly what leaves 128 degree-1 residues instead of 256 scalars.
 */
export function ntt(p: Poly): void {
  polyReduce(p);
  let i = 1;
  for (let len = 128; len >= 2; len >>= 1) {
    for (let start = 0; start < N; start += 2 * len) {
      const zeta = ZETAS[i++];
      for (let j = start; j < start + len; j++) {
        const t = (zeta * p[j + len]) % Q;
        const u = p[j];
        let lo = u + t;
        if (lo >= Q) lo -= Q;
        let hi = u - t;
        if (hi < 0) hi += Q;
        p[j] = lo;
        p[j + len] = hi;
      }
    }
  }
}

/**
 * Inverse NTT, in place (FIPS 203 Algorithm 10), including the final
 * multiplication by 128^-1. Mirrors `ntt`: same twiddles, consumed backwards.
 */
export function invNtt(p: Poly): void {
  polyReduce(p);
  let i = 127;
  for (let len = 2; len <= 128; len <<= 1) {
    for (let start = 0; start < N; start += 2 * len) {
      const zeta = ZETAS[i--];
      for (let j = start; j < start + len; j++) {
        const t = p[j];
        const v = p[j + len];
        let lo = t + v;
        if (lo >= Q) lo -= Q;
        let diff = v - t;
        if (diff < 0) diff += Q;
        p[j] = lo;
        p[j + len] = (zeta * diff) % Q;
      }
    }
  }
  for (let j = 0; j < N; j++) {
    p[j] = (p[j] * N_INV) % Q;
  }
}

/**
 * Pointwise multiplication in the NTT domain (FIPS 203 Algorithms 11 and 12).
 *
 * This is 128 independent multiplications of degree-1 polynomials modulo
 * X^2 - gamma_i, i.e. 128 small 2x2 products — not 256 scalar products:
 *
 *   (a0 + a1 X)(b0 + b1 X) mod (X^2 - g) = (a0 b0 + g a1 b1) + (a0 b1 + a1 b0) X
 */
export function basemul(a: Poly, b: Poly): Poly {
  const r = polyNew();
  for (let i = 0; i < 128; i++) {
    const j = 2 * i;
    const a0 = canon(a[j]);
    const a1 = canon(a[j + 1]);
    const b0 = canon(b[j]);
    const b1 = canon(b[j + 1]);
    const t = (a1 * b1) % Q;
    r[j] = (a0 * b0 + t * GAMMAS[i]) % Q;
    r[j + 1] = (a0 * b1 + a1 * b0) % Q;
  }
  return r;
}

export function polyAdd(a: Poly, b: Poly): Poly {
  const r = polyNew();
  for (let i = 0; i < N; i++) {
    r[i] = canon(a[i] + b[i]);
  }
  return r;
}

export function polySub(a: Poly, b: Poly): Poly {
  const r = polyNew();
  for (let i = 0; i < N; i++) {
    r[i] = canon(a[i] - b[i]);
  }
  return r;
}

/**
 * Centred binomial distribution (FIPS 203 Algorithm 8).
 *
 * Consumes exactly 64*eta bytes = 512*eta bits and emits 256 coefficients; each
 * coefficient is (sum of eta bits) - (sum of the next eta bits), which lands in
 * [-eta, eta] with a binomial shape centred on zero.
 *
 * Per the standard the result is reduced mod q, so a coefficient of -1 is
 * returned as 3328. The signed value is recovered as `c > Q/2 ? c - Q : c`;
 * this keeps the single [0, q) invariant that the rest of the file relies on.
 */
export function cbd(bytes: Uint8Array, eta: number): Poly {
  const need = 64 * eta;
  if (bytes.length < need) {
    throw new Error(`cbd: need ${need} bytes for eta=${eta}, got ${bytes.length}`);
  }
  const r = polyNew();
  // Bit b at index n is bytes[n >> 3] >> (n & 7).
  let bit = 0;
  for (let i = 0; i < N; i++) {
    let x = 0;
    for (let j = 0; j < eta; j++, bit++) {
      x += (bytes[bit >> 3] >> (bit & 7)) & 1;
    }
    let y = 0;
    for (let j = 0; j < eta; j++, bit++) {
      y += (bytes[bit >> 3] >> (bit & 7)) & 1;
    }
    r[i] = canon(x - y);
  }
  return r;
}

/**
 * Compress_d (FIPS 203 4.2.1): round(2^d / q * x) mod 2^d, round-half-up.
 *
 * Pure integer arithmetic. The half-up rounding of 2^d*x/q is
 * floor((2^(d+1)*x + q) / 2q); since the numerator there is always odd and the
 * denominator always even, that equals floor((2^d*x + floor(q/2)) / q), which
 * is what we compute. Floating point would drift by one on ties and show up
 * later as rare decryption failures.
 */
export function compress(p: Poly, d: number): Poly {
  if (d < 1 || d > 12) throw new Error(`compress: unsupported d=${d}`);
  const scale = 1 << d;
  const mask = scale - 1;
  const half = Q >> 1; // 1664
  const r = polyNew();
  for (let i = 0; i < N; i++) {
    const x = canon(p[i]);
    r[i] = Math.floor((x * scale + half) / Q) & mask;
  }
  return r;
}

/** Decompress_d (FIPS 203 4.2.1): round(q / 2^d * y) = floor((q*y + 2^(d-1)) / 2^d). */
export function decompress(p: Poly, d: number): Poly {
  if (d < 1 || d > 12) throw new Error(`decompress: unsupported d=${d}`);
  const scale = 1 << d;
  const mask = scale - 1;
  const half = 1 << (d - 1);
  const r = polyNew();
  for (let i = 0; i < N; i++) {
    const y = p[i] & mask;
    r[i] = (Q * y + half) >> d;
  }
  return r;
}

/**
 * ByteEncode_d (FIPS 203 Algorithm 5): pack 256 d-bit values little-endian
 * (least significant bit first) into exactly 32*d bytes. Handles d in
 * {1, 4, 5, 10, 11, 12} — every width ML-KEM uses.
 *
 * The accumulator never holds more than 7 + 12 = 19 bits, so the 32-bit
 * bitwise operators are safe.
 */
export function byteEncode(p: Poly, d: number): Uint8Array {
  if (d < 1 || d > 12) throw new Error(`byteEncode: unsupported d=${d}`);
  const mask = d === 12 ? 0xfff : (1 << d) - 1;
  const out = new Uint8Array(32 * d);
  let acc = 0;
  let accBits = 0;
  let o = 0;
  for (let i = 0; i < N; i++) {
    acc |= (canon(p[i]) & mask) << accBits;
    accBits += d;
    while (accBits >= 8) {
      out[o++] = acc & 0xff;
      acc >>>= 8;
      accBits -= 8;
    }
  }
  return out;
}

/**
 * ByteDecode_d (FIPS 203 Algorithm 6). For d < 12 the d-bit value is taken as
 * is; for d = 12 it is reduced mod q, per the standard (a hostile or corrupt
 * 12-bit field can name a value >= q, and the standard defines the result there
 * rather than rejecting it).
 */
export function byteDecode(b: Uint8Array, d: number): Poly {
  if (d < 1 || d > 12) throw new Error(`byteDecode: unsupported d=${d}`);
  if (b.length < 32 * d) {
    throw new Error(`byteDecode: need ${32 * d} bytes for d=${d}, got ${b.length}`);
  }
  const mask = d === 12 ? 0xfff : (1 << d) - 1;
  const r = polyNew();
  let acc = 0;
  let accBits = 0;
  let o = 0;
  for (let i = 0; i < N; i++) {
    while (accBits < d) {
      acc |= b[o++] << accBits;
      accBits += 8;
    }
    const v = acc & mask;
    acc >>>= d;
    accBits -= d;
    r[i] = d === 12 ? v % Q : v;
  }
  return r;
}

/** One SHAKE128 block. Divisible by 3, so whole 3-byte groups never straddle. */
const XOF_BLOCK = 168;

/**
 * SampleNTT (FIPS 203 Algorithm 7): rejection-sample a uniform element of the
 * NTT domain — this is how a column of the matrix A is derived from rho.
 *
 * Each 3 bytes yield two 12-bit candidates; a candidate is kept only if it is
 * < q, which is what makes the output exactly uniform (masking or reducing
 * would bias it). `squeeze` is called for more bytes as needed so the caller
 * can drive a real incremental SHAKE128 XOF rather than guessing a bound up
 * front. The result is already in the NTT domain; do not call `ntt` on it.
 */
export function sampleNttFromXof(squeeze: (n: number) => Uint8Array): Poly {
  const a = polyNew();
  let j = 0;
  let buf = new Uint8Array(0);
  let pos = 0;
  while (j < N) {
    if (pos + 3 > buf.length) {
      // Carry the 0-2 unconsumed bytes forward and top up from the XOF.
      const leftover = buf.subarray(pos);
      const fresh = squeeze(XOF_BLOCK);
      if (fresh.length === 0) {
        throw new Error("sampleNttFromXof: squeeze returned no bytes");
      }
      const next = new Uint8Array(leftover.length + fresh.length);
      next.set(leftover, 0);
      next.set(fresh, leftover.length);
      buf = next;
      pos = 0;
      if (buf.length < 3) continue;
    }
    const b0 = buf[pos];
    const b1 = buf[pos + 1];
    const b2 = buf[pos + 2];
    pos += 3;
    const d1 = b0 | ((b1 & 0x0f) << 8);
    const d2 = (b1 >> 4) | (b2 << 4);
    if (d1 < Q && j < N) {
      a[j++] = d1;
    }
    if (d2 < Q && j < N) {
      a[j++] = d2;
    }
  }
  return a;
}
