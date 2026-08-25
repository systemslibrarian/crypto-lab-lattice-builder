// ML-KEM (FIPS 203). Educational implementation for an exhibit: it follows the
// standard closely enough to reproduce NIST's known-answer vectors, but it makes
// no attempt at constant-time execution and must not be used to protect anything.
import { sha3_256, sha3_512, shake256, shake128Xof } from "./keccak";
import {
  PARAMS,
  basemul,
  byteDecode,
  byteEncode,
  cbd,
  compress,
  decompress,
  invNtt,
  ntt,
  polyAdd,
  polyNew,
  polyReduce,
  polySub,
  sampleNttFromXof,
  type ParamSet,
  type Poly,
  type PolyVec,
} from "./mlkem-poly";

// Accept both the short form and NIST's full ACVP naming, so test vectors and
// UI code can each use whichever is natural.
export type ParamName =
  | "512" | "768" | "1024"
  | "ML-KEM-512" | "ML-KEM-768" | "ML-KEM-1024";

function resolve(paramSet: ParamName): ParamSet {
  const key = (paramSet.startsWith("ML-KEM-") ? paramSet.slice(7) : paramSet) as "512" | "768" | "1024";
  const P = PARAMS[key];
  if (!P) throw new Error(`unknown ML-KEM parameter set: ${paramSet}`);
  return P;
}

export type KeyPair = { ek: Uint8Array; dk: Uint8Array };
export type Encapsulation = { c: Uint8Array; k: Uint8Array };

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

// FIPS 203 names these G, H, J and PRF; keeping the names makes the algorithms
// below line up with the spec line for line.
function G(input: Uint8Array): [Uint8Array, Uint8Array] {
  const h = sha3_512(input);
  return [h.slice(0, 32), h.slice(32, 64)];
}
const H = (input: Uint8Array) => sha3_256(input);
const J = (input: Uint8Array) => shake256(input, 32);
const PRF = (eta: number, s: Uint8Array, b: number) => shake256(concat(s, Uint8Array.of(b)), 64 * eta);

// A[i][j] = SampleNTT(rho || j || i); the transpose used by Encrypt swaps the
// two index bytes rather than transposing the matrix afterwards.
function sampleMatrix(rho: Uint8Array, k: number, transposed: boolean): Poly[][] {
  const a: Poly[][] = [];
  for (let i = 0; i < k; i += 1) {
    const row: Poly[] = [];
    for (let j = 0; j < k; j += 1) {
      const idx = transposed ? Uint8Array.of(i, j) : Uint8Array.of(j, i);
      const xof = shake128Xof(concat(rho, idx));
      row.push(sampleNttFromXof((n) => xof.squeeze(n)));
    }
    a.push(row);
  }
  return a;
}

function vecNtt(v: PolyVec): PolyVec {
  return v.map((p) => { const q = Poly16(p); ntt(q); return q; });
}
function Poly16(p: Poly): Poly {
  return p.slice() as Poly;
}
// sum_j basemul(row[j], v[j]) -- the inner product in the NTT domain
function dotNtt(row: Poly[], v: PolyVec): Poly {
  let acc = polyNew();
  for (let j = 0; j < row.length; j += 1) acc = polyAdd(acc, basemul(row[j], v[j]));
  polyReduce(acc);
  return acc;
}

function pkeKeyGen(d: Uint8Array, P: ParamSet): { ekPke: Uint8Array; dkPke: Uint8Array } {
  const { k, eta1 } = P;
  const [rho, sigma] = G(concat(d, Uint8Array.of(k)));
  const a = sampleMatrix(rho, k, false);

  let n = 0;
  const s: PolyVec = [];
  for (let i = 0; i < k; i += 1) s.push(cbd(PRF(eta1, sigma, n++), eta1));
  const e: PolyVec = [];
  for (let i = 0; i < k; i += 1) e.push(cbd(PRF(eta1, sigma, n++), eta1));

  const sHat = vecNtt(s);
  const eHat = vecNtt(e);
  const tHat: PolyVec = [];
  for (let i = 0; i < k; i += 1) {
    const acc = polyAdd(dotNtt(a[i], sHat), eHat[i]);
    polyReduce(acc);
    tHat.push(acc);
  }

  const ekPke = concat(...tHat.map((p) => byteEncode(p, 12)), rho);
  const dkPke = concat(...sHat.map((p) => byteEncode(p, 12)));
  return { ekPke, dkPke };
}

function pkeEncrypt(ekPke: Uint8Array, m: Uint8Array, r: Uint8Array, P: ParamSet): Uint8Array {
  const { k, eta1, eta2, du, dv } = P;
  const tHat: PolyVec = [];
  for (let i = 0; i < k; i += 1) tHat.push(byteDecode(ekPke.subarray(384 * i, 384 * (i + 1)), 12));
  const rho = ekPke.subarray(384 * k, 384 * k + 32);
  const at = sampleMatrix(rho, k, true);

  let n = 0;
  const y: PolyVec = [];
  for (let i = 0; i < k; i += 1) y.push(cbd(PRF(eta1, r, n++), eta1));
  const e1: PolyVec = [];
  for (let i = 0; i < k; i += 1) e1.push(cbd(PRF(eta2, r, n++), eta2));
  const e2 = cbd(PRF(eta2, r, n), eta2);

  const yHat = vecNtt(y);
  const u: PolyVec = [];
  for (let i = 0; i < k; i += 1) {
    const t = dotNtt(at[i], yHat);
    invNtt(t);
    const sum = polyAdd(t, e1[i]);
    polyReduce(sum);
    u.push(sum);
  }

  const mu = decompress(byteDecode(m, 1), 1);
  const vt = dotNtt(tHat, yHat);
  invNtt(vt);
  const v = polyAdd(polyAdd(vt, e2), mu);
  polyReduce(v);

  const c1 = concat(...u.map((p) => byteEncode(compress(p, du), du)));
  const c2 = byteEncode(compress(v, dv), dv);
  return concat(c1, c2);
}

function pkeDecrypt(dkPke: Uint8Array, c: Uint8Array, P: ParamSet): Uint8Array {
  const { k, du, dv } = P;
  const c1Len = 32 * du * k;
  const u: PolyVec = [];
  for (let i = 0; i < k; i += 1) {
    const chunk = c.subarray(32 * du * i, 32 * du * (i + 1));
    u.push(decompress(byteDecode(chunk, du), du));
  }
  const v = decompress(byteDecode(c.subarray(c1Len, c1Len + 32 * dv), dv), dv);

  const sHat: PolyVec = [];
  for (let i = 0; i < k; i += 1) sHat.push(byteDecode(dkPke.subarray(384 * i, 384 * (i + 1)), 12));

  const uHat = vecNtt(u);
  const su = dotNtt(sHat, uHat);
  invNtt(su);
  const w = polySub(v, su);
  polyReduce(w);
  return byteEncode(compress(w, 1), 1);
}

// Deterministic entry points -- these are what NIST's KAT vectors exercise,
// since KeyGen and Encaps are randomised in normal use.
export function keyGenInternal(d: Uint8Array, z: Uint8Array, paramSet: ParamName): KeyPair {
  const P = resolve(paramSet);
  const { ekPke, dkPke } = pkeKeyGen(d, P);
  return { ek: ekPke, dk: concat(dkPke, ekPke, H(ekPke), z) };
}

export function encapsInternal(ek: Uint8Array, m: Uint8Array, paramSet: ParamName): Encapsulation {
  const P = resolve(paramSet);
  const [k, r] = G(concat(m, H(ek)));
  return { c: pkeEncrypt(ek, m, r, P), k };
}

export function decaps(dk: Uint8Array, c: Uint8Array, paramSet: ParamName): Uint8Array {
  const P = resolve(paramSet);
  const kk = P.k;
  const dkPke = dk.subarray(0, 384 * kk);
  const ekPke = dk.subarray(384 * kk, 768 * kk + 32);
  const h = dk.subarray(768 * kk + 32, 768 * kk + 64);
  const z = dk.subarray(768 * kk + 64, 768 * kk + 96);

  const mPrime = pkeDecrypt(dkPke, c, P);
  const [kPrime, rPrime] = G(concat(mPrime, h));
  const kBar = J(concat(z, c));
  const cPrime = pkeEncrypt(ekPke, mPrime, rPrime, P);

  // Implicit rejection: a tampered ciphertext yields a pseudorandom key rather
  // than an error, so a caller learns nothing from the failure itself.
  let diff = c.length ^ cPrime.length;
  for (let i = 0; i < c.length && i < cPrime.length; i += 1) diff |= c[i] ^ cPrime[i];
  return diff === 0 ? kPrime : kBar;
}

export function keyGen(paramSet: ParamName, random: (n: number) => Uint8Array): KeyPair {
  return keyGenInternal(random(32), random(32), paramSet);
}

export function encaps(ek: Uint8Array, paramSet: ParamName, random: (n: number) => Uint8Array): Encapsulation {
  return encapsInternal(ek, random(32), paramSet);
}

export function sizes(paramSet: ParamName) {
  const { k, du, dv } = resolve(paramSet);
  return { k, ek: 384 * k + 32, dk: 768 * k + 96, c: 32 * (du * k + dv), sharedSecret: 32 };
}
