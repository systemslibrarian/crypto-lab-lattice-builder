import { useEffect, useMemo, useRef, useState } from "react";
import {
  LADDER,
  alphabet,
  candidateFromCode,
  formatEta,
  formatSpace,
  makeInstance,
  makeOps,
  residual,
  type Instance,
  type ToyParams,
} from "./mlwe";
import { decaps, encaps, keyGen, sizes, type ParamName } from "./mlkem";

const TOY = LADDER[0];
const SEED = 20260825;

function randomBytes(n: number) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

function hex(bytes: Uint8Array, take = 12) {
  const head = Array.from(bytes.subarray(0, take), (b) => b.toString(16).padStart(2, "0")).join("");
  return bytes.length > take ? `${head}…` : head;
}

type Search = {
  running: boolean;
  tried: number;
  best: number;
  bestCode: number;
  found: boolean;
  rate: number;
  buckets: { right: number; count: number; mean: number }[];
};

const IDLE: Search = { running: false, tried: 0, best: Infinity, bestCode: -1, found: false, rate: 0, buckets: [] };

export default function AdvancedMode() {
  const instance = useMemo<Instance>(() => makeInstance(TOY, SEED), []);
  const ops = useMemo(() => makeOps(TOY), []);
  const coefficientCount = TOY.n * TOY.k;

  const [guess, setGuess] = useState<number[]>(() => new Array(coefficientCount).fill(0));
  const [search, setSearch] = useState<Search>(IDLE);
  const [rung, setRung] = useState(0);
  const raf = useRef<number | null>(null);

  const trueFlat = useMemo(
    () => instance.s.flatMap((poly) => poly.map(ops.centre)),
    [instance, ops],
  );

  const guessPoly = useMemo(() => {
    const out: number[][] = [];
    for (let i = 0; i < TOY.k; i += 1) out.push(guess.slice(i * TOY.n, (i + 1) * TOY.n).map(ops.mod));
    return out;
  }, [guess, ops]);

  const mismatch = residual(instance, guessPoly);
  const rightNow = guess.reduce((n, v, i) => n + (v === trueFlat[i] ? 1 : 0), 0);
  const solvedByHand = rightNow === coefficientCount;

  useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current); }, []);

  function cycle(index: number) {
    setGuess((g) => {
      const next = [...g];
      next[index] = next[index] >= TOY.eta ? -TOY.eta : next[index] + 1;
      return next;
    });
  }

  function runSearch() {
    if (search.running) return;
    const total = alphabet(TOY) ** coefficientCount;
    const sums = new Array(coefficientCount + 1).fill(0);
    const counts = new Array(coefficientCount + 1).fill(0);
    let code = 0;
    let best = Infinity;
    let bestCode = -1;
    let computeMs = 0;
    setSearch({ ...IDLE, running: true });

    const step = () => {
      const chunkStarted = performance.now();
      const chunk = Math.min(60, total - code);
      for (let i = 0; i < chunk; i += 1, code += 1) {
        const cand = candidateFromCode(code, TOY);
        const r = residual(instance, cand);
        if (r < best) { best = r; bestCode = code; }
        const flat = cand.flatMap((poly) => poly.map(ops.centre));
        const right = flat.reduce((n, v, j) => n + (v === trueFlat[j] ? 1 : 0), 0);
        sums[right] += r;
        counts[right] += 1;
      }
      computeMs += performance.now() - chunkStarted;
      if (code >= total) {
        setSearch({
          running: false, tried: code, best, bestCode, found: true,
          rate: code / Math.max(computeMs / 1000, 1e-9),
          buckets: counts.map((c, right) => ({ right, count: c, mean: c ? sums[right] / c : 0 })).filter((b) => b.count > 0),
        });
        setGuess(candidateFromCode(bestCode, TOY).flatMap((poly) => poly.map(ops.centre)));
        return;
      }
      setSearch((s) => ({ ...s, tried: code, best, bestCode }));
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  }

  const measuredRate = search.rate > 0 ? search.rate : 6e5;

  return (
    <section className="advanced-section" id="advanced">
      <div className="lesson-heading">
        <p className="eyebrow">ADVANCED · THE REAL THING</p>
        <h2>Now break it<br />for real.</h2>
        <p>The board you just played is an analogy. This is not — it is the same construction ML-KEM uses, shrunk until you can win, then turned back up until nobody can.</p>
      </div>

      <div className="adv-block">
        <div className="adv-head"><span>01 / BREAK IT</span><h3>A lattice small enough to lose</h3></div>
        <p className="adv-copy">
          Below is a Module-LWE instance: a public matrix <b>A</b> and a public vector <b>t</b>, built as <b>t = A·s + e</b> from a
          secret <b>s</b> and a small error <b>e</b>. Recovering <b>s</b> from <b>A</b> and <b>t</b> is the whole game. This one uses
          n={TOY.n}, k={TOY.k}, q={TOY.q} — so the secret is {coefficientCount} coefficients, each −1, 0 or +1,
          and there are only <b>{formatSpace(TOY)}</b> possibilities.
        </p>

        <div className="adv-grid">
          <div className="adv-panel">
            <h4>THE SECRET YOU ARE HUNTING</h4>
            <p className="adv-note">Click a cell to cycle it. Then watch the mismatch.</p>
            <div className="coef-row">
              {guess.map((v, i) => (
                <button
                  key={i}
                  className={`coef ${v === 0 ? "zero" : ""} ${search.found && v === trueFlat[i] ? "right" : ""}`}
                  onClick={() => cycle(i)}
                  aria-label={`Secret coefficient ${i + 1}, currently ${v}`}
                >{v > 0 ? `+${v}` : v}</button>
              ))}
            </div>
            <div className="adv-readout">
              <div><span>MISMATCH</span><strong className={solvedByHand ? "hit" : ""}>{mismatch.toFixed(2)}</strong></div>
              <div><span>COEFFICIENTS RIGHT</span><strong>{rightNow} / {coefficientCount}</strong></div>
            </div>
            <p className="adv-note">
              {solvedByHand
                ? "That is the secret. The mismatch collapses only here — one cell out and it is back up with everything else."
                : "Try to steer it down. You cannot: the mismatch is the same size whether you have seven coefficients right or none."}
            </p>
          </div>

          <div className="adv-panel">
            <h4>EXHAUSTIVE SEARCH</h4>
            <p className="adv-note">Since nothing guides you, the only method left is trying everything.</p>
            <button className="primary-button" onClick={runSearch} disabled={search.running}>
              {search.running ? "SEARCHING…" : search.found ? "SEARCH AGAIN" : `TRY ALL ${formatSpace(TOY)}`}<span>→</span>
            </button>
            <div className="adv-readout">
              <div><span>TRIED</span><strong>{search.tried.toLocaleString("en-US")}</strong></div>
              <div><span>BEST MISMATCH</span><strong className={search.found ? "hit" : ""}>{search.best === Infinity ? "—" : search.best.toFixed(2)}</strong></div>
            </div>
            {search.found && (
              <p className="adv-note">
                Key recovered in {search.tried.toLocaleString("en-US")} tries at {Math.round(search.rate).toLocaleString("en-US")} per second.
                The dials above are now set to the true secret.
              </p>
            )}
          </div>
        </div>

        {search.buckets.length > 0 && (
          <div className="adv-flat">
            <h4>WHY NOTHING GUIDED YOU</h4>
            <p className="adv-copy">
              Every one of the {formatSpace(TOY)} candidates, grouped by how many coefficients it got right.
              If the mismatch were a hill you could climb, this column would slope. It does not — it is flat until the answer, and then it falls off a cliff.
            </p>
            <div className="flat-table">
              {search.buckets.map((b) => {
                const width = Math.min(100, (b.mean / Math.max(...search.buckets.map((x) => x.mean))) * 100);
                return (
                  <div className={`flat-row ${b.right === coefficientCount ? "is-answer" : ""}`} key={b.right}>
                    <span className="flat-label">{b.right} right</span>
                    <span className="flat-bar"><i style={{ width: `${width}%` }} /></span>
                    <span className="flat-value">{b.mean.toFixed(1)}</span>
                    <span className="flat-count">{b.count.toLocaleString("en-US")}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="adv-block">
        <div className="adv-head"><span>02 / TURN IT UP</span><h3>The same problem, bigger</h3></div>
        <p className="adv-copy">
          Nothing about the construction changes on the rungs below — same <b>t = A·s + e</b>, same exhaustive search, same code.
          Only n grows. Times assume the rate your browser just measured.
        </p>
        <div className="ladder">
          <div className="ladder-row is-head"><span>PARAMETERS</span><span>SECRETS TO TRY</span><span>TIME TO GRIND THEM</span></div>
          {LADDER.map((p: ToyParams, i) => (
            <button
              className={`ladder-row ${i === rung ? "on" : ""} ${p.real ? "is-real" : ""}`}
              key={p.label}
              onClick={() => setRung(i)}
            >
              <span><b>{p.label}</b> n={p.n} k={p.k} q={p.q}</span>
              <span>{formatSpace(p)}</span>
              <span>{formatEta(p, measuredRate)}</span>
            </button>
          ))}
        </div>
        <p className="adv-note">
          Brute force is the naive attack, not the best one — real cryptanalysis uses lattice reduction and does far better than these
          numbers. It is still nowhere near enough. ML-KEM-512 is designed to be about as hard to break as AES-128.
        </p>
      </div>

      <Instrument />
    </section>
  );
}

type Session = {
  paramSet: ParamName;
  ek: Uint8Array;
  dk: Uint8Array;
  c: Uint8Array;
  kSender: Uint8Array;
  kReceiver: Uint8Array;
  tamperedK: Uint8Array | null;
  ms: number;
};

function Instrument() {
  const [paramSet, setParamSet] = useState<ParamName>("ML-KEM-512");
  const [session, setSession] = useState<Session | null>(null);

  function run(tamper: boolean) {
    const t0 = performance.now();
    const { ek, dk } = keyGen(paramSet, randomBytes);
    const { c, k } = encaps(ek, paramSet, randomBytes);
    const kReceiver = decaps(dk, c, paramSet);
    const ms = performance.now() - t0;
    let tamperedK: Uint8Array | null = null;
    if (tamper) {
      const bad = Uint8Array.from(c);
      bad[Math.floor(Math.random() * bad.length)] ^= 1;
      tamperedK = decaps(dk, bad, paramSet);
    }
    setSession({ paramSet, ek, dk, c, kSender: k, kReceiver, tamperedK, ms });
  }

  const size = sizes(paramSet);
  const agree = session && hex(session.kSender, 32) === hex(session.kReceiver, 32);

  return (
    <div className="adv-block">
      <div className="adv-head"><span>03 / THE REAL THING</span><h3>ML-KEM, running here</h3></div>
      <p className="adv-copy">
        This is not a model of ML-KEM. It is ML-KEM — the FIPS 203 algorithm, implemented in this page, checked against all 54 of
        NIST's published test vectors. The lattice underneath is the last rung of the ladder above.
      </p>

      <div className="param-switch" role="group" aria-label="Parameter set">
        {(["ML-KEM-512", "ML-KEM-768", "ML-KEM-1024"] as ParamName[]).map((p) => (
          <button key={p} className={p === paramSet ? "on" : ""} onClick={() => { setParamSet(p); setSession(null); }} aria-pressed={p === paramSet}>{p}</button>
        ))}
      </div>

      <div className="adv-actions">
        <button className="primary-button" onClick={() => run(false)}>RUN A KEY EXCHANGE<span>→</span></button>
        <button className="ghost-button" onClick={() => run(true)}>RUN ONE, THEN TAMPER WITH IT</button>
      </div>

      <div className="kv">
        <div><span>ENCAPSULATION KEY</span><strong>{session ? hex(session.ek) : "—"}</strong><em>{size.ek} bytes</em></div>
        <div><span>CIPHERTEXT</span><strong>{session ? hex(session.c) : "—"}</strong><em>{size.c} bytes</em></div>
        <div><span>SENDER'S SHARED SECRET</span><strong>{session ? hex(session.kSender, 16) : "—"}</strong><em>32 bytes</em></div>
        <div><span>RECEIVER'S SHARED SECRET</span><strong className={agree ? "hit" : ""}>{session ? hex(session.kReceiver, 16) : "—"}</strong><em>{session ? (agree ? "identical" : "MISMATCH") : "32 bytes"}</em></div>
      </div>

      {session && (
        <p className="adv-note">
          Whole exchange — keygen, encapsulate, decapsulate — in {session.ms.toFixed(1)} ms. Two parties who never exchanged a
          secret now hold the same 32 bytes, and everything on the wire is above.
        </p>
      )}

      {session?.tamperedK && (
        <div className="tamper">
          <h4>ONE BIT FLIPPED IN THE CIPHERTEXT</h4>
          <div className="kv">
            <div><span>SHARED SECRET NOW</span><strong className="wrong">{hex(session.tamperedK, 16)}</strong><em>rejected</em></div>
          </div>
          <p className="adv-note">
            Decapsulation did not fail — it returned a different key, derived from a value only the receiver holds. An attacker
            who tampers learns nothing from the outcome, because there is no outcome to read. That is implicit rejection, and it
            is the part of the standard that is easiest to get quietly wrong.
          </p>
        </div>
      )}

      <div className="honesty-note">
        <span>USE NOTE</span>
        <p>
          This implementation exists to be looked at. It is correct against NIST's vectors but makes no attempt to run in constant
          time, so it leaks timing information and must not be used to protect anything real. Use a reviewed library for that.
        </p>
      </div>
    </div>
  );
}
