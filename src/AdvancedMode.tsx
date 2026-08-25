import { useEffect, useMemo, useRef, useState } from "react";
import {
  LADDER,
  alphabet,
  candidateFromCode,
  formatEta,
  formatSpace,
  makeInstance,
  makeOps,
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
  return bytes.length > take ? `${head}\u2026` : head;
}

function Poly({ values, tone }: { values: number[]; tone?: (v: number) => string }) {
  return (
    <span className="poly">
      {values.map((v, i) => <i className={tone ? tone(v) : ""} key={i}>{v}</i>)}
    </span>
  );
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

  const guessPoly = useMemo(() => {
    const out: number[][] = [];
    for (let i = 0; i < TOY.k; i += 1) out.push(guess.slice(i * TOY.n, (i + 1) * TOY.n).map(ops.mod));
    return out;
  }, [guess, ops]);

  // The only test an attacker can actually run: is t - A*s' small? The error e was
  // drawn from {-eta..eta}, so at the true secret every coefficient lands inside
  // that band and nowhere else does. Verified unique over 60 instances.
  function leftover(candidate: number[][]) {
    const rows: number[][] = [];
    for (let i = 0; i < TOY.k; i += 1) {
      rows.push(ops.sub(instance.t[i], ops.dot(instance.a[i], candidate)).map(ops.centre));
    }
    return rows;
  }
  function worstOf(rows: number[][]) {
    let m = 0;
    for (const row of rows) for (const v of row) m = Math.max(m, Math.abs(v));
    return m;
  }

  const diff = useMemo(() => leftover(guessPoly), [guessPoly]);
  const worst = worstOf(diff);
  const isKey = worst <= TOY.eta;

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
    const trueFlat = instance.s.flatMap((poly) => poly.map(ops.centre));
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
        const w = worstOf(leftover(cand));
        if (w < best) { best = w; bestCode = code; }
        const flat = cand.flatMap((poly) => poly.map(ops.centre));
        const right = flat.reduce((n, v, j) => n + (v === trueFlat[j] ? 1 : 0), 0);
        sums[right] += w;
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

  const measuredRate = search.rate > 0 ? search.rate : 1e5;
  const tone = (v: number) => (Math.abs(v) <= TOY.eta ? "small" : "big");

  return (
    <section className="advanced-section" id="advanced">
      <div className="lesson-heading">
        <p className="eyebrow">ADVANCED · THE REAL THING</p>
        <h2>Now break<br />a real one.</h2>
        <p>The board above is an analogy. What follows is not — it is the construction ML-KEM actually uses, shrunk until you can break it by hand, then turned back up until nobody can.</p>
      </div>

      <div className="stakes">
        <span>WHY THIS MATTERS</span>
        <p>
          Public-key cryptography publishes one number and keeps its partner secret. Here the published half is <b>t</b>; the
          secret half is <b>s</b>. Anyone who can work backwards from <b>t</b> to <b>s</b> holds the private key and can read
          everything sent to its owner. Every rung below is the same sum — <b>t = A·s + e</b> — and the only question is
          whether working backwards is possible. Below, it is. That is the point.
        </p>
      </div>

      <div className="adv-block">
        <div className="adv-head"><span>01 / BREAK IT</span><h3>A private key small enough to steal</h3></div>
        <p className="adv-copy">
          This is a genuine instance, at n={TOY.n}, k={TOY.k}, q={TOY.q}. Numbers are polynomial coefficients and all arithmetic is
          mod {TOY.q}. Everything in the first panel is public — it is exactly, and only, what an eavesdropper gets.
          The secret <b>s</b> is {coefficientCount} coefficients, each −1, 0 or +1, so there are just <b>{formatSpace(TOY)}</b> possible private keys.
        </p>

        <div className="adv-grid">
          <div className="adv-panel">
            <h4>PUBLISHED · EVERYONE CAN SEE THIS</h4>
            <div className="lwe-public">
              <div className="lwe-item">
                <span className="lwe-tag">A <em>— the shared matrix</em></span>
                {instance.a.map((row, i) => (
                  <div className="poly-line" key={i}>{row.map((poly, j) => <Poly key={j} values={poly} />)}</div>
                ))}
              </div>
              <div className="lwe-item">
                <span className="lwe-tag">t <em>— the public key</em></span>
                {instance.t.map((poly, i) => <div className="poly-line" key={i}><Poly values={poly} /></div>)}
              </div>
            </div>
            <p className="adv-note">
              A and t never change. Every guess below is checked against these same numbers.
            </p>
          </div>

          <div className="adv-panel">
            <h4>YOUR GUESS AT THE PRIVATE KEY s</h4>
            <p className="adv-note">Click any cell to cycle it between −1, 0 and +1.</p>
            <div className="coef-row">
              {guess.map((v, i) => (
                <button
                  key={i}
                  className={`coef ${v === 0 ? "zero" : ""}`}
                  onClick={() => cycle(i)}
                  aria-label={`Secret coefficient ${i + 1} of ${coefficientCount}, currently ${v}`}
                >{v > 0 ? `+${v}` : v}</button>
              ))}
            </div>

            <h4 className="spaced">THE TEST · t − A·s</h4>
            <p className="adv-note">
              If your guess is the private key, subtracting <b>A·s</b> from <b>t</b> leaves only the tiny error <b>e</b> —
              every number inside ±{TOY.eta}. Anything else leaves junk.
            </p>
            <div className="lwe-diff">
              {diff.map((row, i) => <div className="poly-line" key={i}><Poly values={row} tone={tone} /></div>)}
            </div>
            <div className={`verdict ${isKey ? "is-key" : ""}`}>
              {isKey
                ? <><strong>EVERY NUMBER INSIDE ±{TOY.eta}</strong><span>This is the private key.</span></>
                : <><strong>BIGGEST NUMBER: {worst}</strong><span>Not the key — it needs to be {TOY.eta} or less.</span></>}
            </div>
          </div>
        </div>

        <div className="adv-panel wide">
          <h4>WHEN GUESSING STOPS WORKING</h4>
          <p className="adv-copy">
            You will notice the leftover numbers do not get smaller as you get closer. They are junk until they are the answer.
            With nothing to steer by, the only method left is trying every possible key.
          </p>
          <button className="primary-button" onClick={runSearch} disabled={search.running}>
            {search.running ? "SEARCHING…" : search.found ? "SEARCH AGAIN" : `TRY ALL ${formatSpace(TOY)} PRIVATE KEYS`}<span>→</span>
          </button>
          <div className="adv-readout">
            <div><span>KEYS TRIED</span><strong>{search.tried.toLocaleString("en-US")}</strong></div>
            <div><span>SMALLEST LEFTOVER SO FAR</span><strong className={search.found ? "hit" : ""}>{search.best === Infinity ? "—" : search.best}</strong></div>
          </div>
          {search.found && (
            <p className="adv-note">
              Private key recovered after {search.tried.toLocaleString("en-US")} attempts, at {Math.round(search.rate).toLocaleString("en-US")} keys
              per second. The cells above now hold the real <b>s</b>, and the leftover is the error <b>e</b> that was hiding it.
            </p>
          )}
        </div>

        {search.buckets.length > 0 && (
          <div className="adv-flat">
            <h4>WHAT YOU WERE UP AGAINST</h4>
            <p className="adv-copy">
              Now that the answer is known, here is the landscape you were searching — all {formatSpace(TOY)} keys, grouped by how many
              coefficients each got right. You could never see this while guessing; that is the whole difficulty. If getting closer
              helped, the bars would shrink as you go down. They do not, until the last row.
            </p>
            <div className="flat-table">
              {search.buckets.map((b) => {
                const width = Math.min(100, (b.mean / Math.max(...search.buckets.map((x) => x.mean))) * 100);
                return (
                  <div className={`flat-row ${b.right === coefficientCount ? "is-answer" : ""}`} key={b.right}>
                    <span className="flat-label">{b.right} of {coefficientCount} right</span>
                    <span className="flat-bar"><i style={{ width: `${width}%` }} /></span>
                    <span className="flat-value">{b.mean.toFixed(1)}</span>
                    <span className="flat-count">{b.count.toLocaleString("en-US")} keys</span>
                  </div>
                );
              })}
            </div>
            <p className="adv-note">Average size of the biggest leftover number, per group. Smaller is closer to being the key.</p>
          </div>
        )}
      </div>

      <div className="adv-block">
        <div className="adv-head"><span>02 / TURN IT UP</span><h3>The same sum, bigger numbers</h3></div>
        <p className="adv-copy">
          Nothing about the construction changes below — same <b>t = A·s + e</b>, same test, same search, same code.
          Only the size of the polynomials grows. Times use the rate your browser just measured.
        </p>
        <div className="ladder">
          <div className="ladder-row is-head"><span>PARAMETERS</span><span>POSSIBLE PRIVATE KEYS</span><span>TIME TO TRY THEM ALL</span></div>
          {LADDER.map((p: ToyParams, i) => (
            <button className={`ladder-row ${i === rung ? "on" : ""} ${p.real ? "is-real" : ""}`} key={p.label} onClick={() => setRung(i)}>
              <span><b>{p.label}</b> n={p.n} k={p.k} q={p.q}</span>
              <span>{formatSpace(p)}</span>
              <span>{formatEta(p, measuredRate)}</span>
            </button>
          ))}
        </div>
        <p className="adv-note">
          The bottom row is not an analogy for ML-KEM-512 — it is ML-KEM-512's actual shape. Brute force is also the naive
          attack rather than the best one: real cryptanalysis uses lattice reduction and does far better than these figures,
          and is still nowhere near enough. ML-KEM-512 is designed to be about as hard to break as AES-128.
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
        Same sum, same test, real numbers. This is not a model of ML-KEM — it is ML-KEM, the FIPS 203 algorithm implemented in
        this page and checked against all 54 of NIST's published test vectors. The <b>t</b> below is a public key exactly like the
        one you just broke, except that recovering its <b>s</b> would take the bottom row of that table.
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
