/**
 * Keccak-f[1600] sponge: SHA3-256, SHA3-512, SHAKE128, SHAKE256.
 *
 * Hand-rolled because the Web Crypto API exposes no SHA-3 or SHAKE, and
 * ML-KEM (FIPS 203) needs both plus an incremental XOF for matrix sampling.
 *
 * Lanes are 64 bits, but BigInt is far too slow for an interactive page, so
 * every lane is stored as two 32-bit halves in a Uint32Array(50):
 * word 2*i is the low half of lane i, word 2*i+1 is the high half.
 */

/** Round constants for iota, split into low/high 32-bit halves. */
const RC_LO = new Uint32Array([
  0x00000001, 0x00008082, 0x0000808a, 0x80008000, 0x0000808b, 0x80000001,
  0x80008081, 0x00008009, 0x0000008a, 0x00000088, 0x80008009, 0x8000000a,
  0x8000808b, 0x0000008b, 0x00008089, 0x00008003, 0x00008002, 0x00000080,
  0x0000800a, 0x8000000a, 0x80008081, 0x00008080, 0x80000001, 0x80008008,
]);

const RC_HI = new Uint32Array([
  0x00000000, 0x00000000, 0x80000000, 0x80000000, 0x00000000, 0x00000000,
  0x80000000, 0x80000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000,
  0x00000000, 0x80000000, 0x80000000, 0x80000000, 0x80000000, 0x80000000,
  0x00000000, 0x80000000, 0x80000000, 0x80000000, 0x00000000, 0x80000000,
]);

/** rho rotation offsets, indexed by lane index x + 5y. */
const ROT = new Uint8Array([
  0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8,
  18, 2, 61, 56, 14,
]);

/** pi permutation: lane x + 5y moves to lane y + 5*((2x + 3y) mod 5). */
const PI = new Uint8Array([
  0, 10, 20, 5, 15, 16, 1, 11, 21, 6, 7, 17, 2, 12, 22, 23, 8, 18, 3, 13, 14,
  24, 9, 19, 4,
]);

// Scratch buffers, reused across permutations. Safe because JS is
// single-threaded and no permutation is ever re-entered.
const C = new Uint32Array(10);
const D = new Uint32Array(10);
const B = new Uint32Array(50);

/** The Keccak-f[1600] permutation, applied in place. */
function keccakF1600(s: Uint32Array): void {
  for (let round = 0; round < 24; round++) {
    // theta: column parities.
    for (let x = 0; x < 5; x++) {
      const i = x << 1;
      C[i] = s[i] ^ s[i + 10] ^ s[i + 20] ^ s[i + 30] ^ s[i + 40];
      C[i + 1] =
        s[i + 1] ^ s[i + 11] ^ s[i + 21] ^ s[i + 31] ^ s[i + 41];
    }
    for (let x = 0; x < 5; x++) {
      const p = ((x + 4) % 5) << 1;
      const n = ((x + 1) % 5) << 1;
      const nlo = C[n];
      const nhi = C[n + 1];
      // D[x] = C[x-1] ^ rotl64(C[x+1], 1); a 64-bit rotate by 1 pulls the
      // top bit of each half into the bottom of the other half.
      D[x << 1] = C[p] ^ ((nlo << 1) | (nhi >>> 31));
      D[(x << 1) + 1] = C[p + 1] ^ ((nhi << 1) | (nlo >>> 31));
    }
    for (let x = 0; x < 5; x++) {
      const dlo = D[x << 1];
      const dhi = D[(x << 1) + 1];
      for (let y = 0; y < 5; y++) {
        const i = (x << 1) + 10 * y;
        s[i] ^= dlo;
        s[i + 1] ^= dhi;
      }
    }

    // rho + pi: rotate each lane, then scatter it to its pi destination.
    for (let i = 0; i < 25; i++) {
      const r = ROT[i];
      const lo = s[i << 1];
      const hi = s[(i << 1) + 1];
      const j = PI[i] << 1;
      if (r === 0) {
        B[j] = lo;
        B[j + 1] = hi;
      } else if (r < 32) {
        // Shifting a 32-bit half left by r loses r bits off the top; those
        // bits come from the other half's top r bits.
        B[j] = (lo << r) | (hi >>> (32 - r));
        B[j + 1] = (hi << r) | (lo >>> (32 - r));
      } else if (r === 32) {
        // JS shifts are mod 32, so `x >>> 32` is a no-op; a 64-bit rotate
        // by exactly 32 is a plain half swap and must be special-cased.
        B[j] = hi;
        B[j + 1] = lo;
      } else {
        // Rotating by r >= 32 is a half swap followed by a rotate by r - 32.
        const t = r - 32;
        B[j] = (hi << t) | (lo >>> (32 - t));
        B[j + 1] = (lo << t) | (hi >>> (32 - t));
      }
    }

    // chi: a[x] ^= ~a[x+1] & a[x+2], along each row.
    for (let y = 0; y < 5; y++) {
      const base = 10 * y;
      for (let x = 0; x < 5; x++) {
        const i = base + (x << 1);
        const i1 = base + (((x + 1) % 5) << 1);
        const i2 = base + (((x + 2) % 5) << 1);
        s[i] = B[i] ^ (~B[i1] & B[i2]);
        s[i + 1] = B[i + 1] ^ (~B[i1 + 1] & B[i2 + 1]);
      }
    }

    // iota.
    s[0] ^= RC_LO[round];
    s[1] ^= RC_HI[round];
  }
}

/**
 * XOR one byte into the state at byte position `p` of the current block.
 *
 * Lanes are little-endian, so byte p lives in word `p >>> 2`: lane p >>> 3
 * starts at word 2 * (p >>> 3), and the byte's half within the lane is
 * (p >>> 2) & 1 — summing those two is exactly p >>> 2.
 */
function xorByte(s: Uint32Array, p: number, byte: number): void {
  s[p >>> 2] ^= byte << ((p & 3) << 3);
}

/** Read byte `p` of the current block out of the state. */
function getByte(s: Uint32Array, p: number): number {
  return (s[p >>> 2] >>> ((p & 3) << 3)) & 0xff;
}

/**
 * Absorb `input` at the given rate and apply pad10*1 with the given domain
 * separation byte, leaving the state permuted and ready to squeeze.
 */
function absorb(
  s: Uint32Array,
  rate: number,
  input: Uint8Array,
  domain: number,
): void {
  const n = input.length;
  let offset = 0;
  while (offset + rate <= n) {
    for (let i = 0; i < rate; i++) {
      xorByte(s, i, input[offset + i]);
    }
    keccakF1600(s);
    offset += rate;
  }
  // Trailing partial block; `rem` is 0 for empty input and for input that is
  // an exact multiple of the rate, which correctly yields a full pad block.
  const rem = n - offset;
  for (let i = 0; i < rem; i++) {
    xorByte(s, i, input[offset + i]);
  }
  // pad10*1: domain byte carries the leading 1 bit, 0x80 sets the trailing
  // one. When rem === rate - 1 both land on the same byte, and XOR-ing them
  // separately still gives domain | 0x80.
  xorByte(s, rem, domain);
  xorByte(s, rate - 1, 0x80);
  keccakF1600(s);
}

/** Absorb, then squeeze exactly `outLen` bytes. */
function keccak(
  rate: number,
  input: Uint8Array,
  domain: number,
  outLen: number,
): Uint8Array {
  const s = new Uint32Array(50);
  absorb(s, rate, input, domain);
  const out = new Uint8Array(outLen);
  let i = 0;
  let pos = 0;
  while (i < outLen) {
    if (pos === rate) {
      keccakF1600(s);
      pos = 0;
    }
    out[i++] = getByte(s, pos++);
  }
  return out;
}

/** An extendable-output function that can be squeezed repeatedly. */
export type Xof = { squeeze(nBytes: number): Uint8Array };

function makeXof(rate: number, input: Uint8Array, domain: number): Xof {
  const s = new Uint32Array(50);
  absorb(s, rate, input, domain);
  // Bytes of the current squeeze block already emitted. absorb() leaves the
  // state permuted, so the first block is live and pos starts at 0.
  let pos = 0;
  return {
    squeeze(nBytes: number): Uint8Array {
      if (!Number.isInteger(nBytes) || nBytes < 0) {
        throw new RangeError("squeeze length must be a non-negative integer");
      }
      const out = new Uint8Array(nBytes);
      let i = 0;
      while (i < nBytes) {
        if (pos === rate) {
          keccakF1600(s);
          pos = 0;
        }
        const take = Math.min(rate - pos, nBytes - i);
        for (let k = 0; k < take; k++) {
          out[i + k] = getByte(s, pos + k);
        }
        pos += take;
        i += take;
      }
      return out;
    },
  };
}

const SHA3_DOMAIN = 0x06;
const SHAKE_DOMAIN = 0x1f;

export function sha3_256(input: Uint8Array): Uint8Array {
  return keccak(136, input, SHA3_DOMAIN, 32);
}

export function sha3_512(input: Uint8Array): Uint8Array {
  return keccak(72, input, SHA3_DOMAIN, 64);
}

export function shake128(input: Uint8Array, outLen: number): Uint8Array {
  return keccak(168, input, SHAKE_DOMAIN, outLen);
}

export function shake256(input: Uint8Array, outLen: number): Uint8Array {
  return keccak(136, input, SHAKE_DOMAIN, outLen);
}

export function shake128Xof(input: Uint8Array): Xof {
  return makeXof(168, input, SHAKE_DOMAIN);
}

export function shake256Xof(input: Uint8Array): Xof {
  return makeXof(136, input, SHAKE_DOMAIN);
}
