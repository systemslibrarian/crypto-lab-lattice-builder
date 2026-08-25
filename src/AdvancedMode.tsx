import { useEffect, useMemo, useRef, useState } from "react";
import {
  LADDER,
  alphabet,
  candidateFromCode,
  formatEta,
  formatSpace,
  makeInstance,
  makeOps,
  spaceLog10,
  type Instance,
  type ToyParams,
} from "./mlwe";
import { decaps, encaps, keyGen, sizes, type ParamName } from "./mlkem";

const TOY = LADDER[0];
const SEED = 20260825;

function randomBytes(n: number) {
  const b = new Uint8Array(n);
  // Universally available in practice, but an unguarded throw here would leave
  // the button looking broken with nothing on screen to explain it.
  if (typeof crypto === "undefined" || typeof crypto.getRandomValues !== "function") {
    throw new Error("this browser provides no secure random number generator");
  }
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
  const [geometry, setGeometry] = useState<{ nearest: number; second: number; typical: number } | null>(null);
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

  // How far is t from the lattice? Measured after first paint so it never blocks
  // render. This is the number that makes the link to the game concrete.
  useEffect(() => {
    const id = setTimeout(() => {
      const norm = (rows: number[][]) => Math.sqrt(rows.reduce((a, r) => a + r.reduce((b, x) => b + x * x, 0), 0));
      const total = alphabet(TOY) ** coefficientCount;
      const all: number[] = [];
      for (let c = 0; c < total; c += 1) all.push(norm(leftover(candidateFromCode(c, TOY))));
      all.sort((a, b) => a - b);
      setGeometry({ nearest: all[0], second: all[1], typical: all[Math.floor(total / 2)] });
    }, 0);
    return () => clearTimeout(id);
  }, []);

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
    setSearch((prev) => ({ ...IDLE, running: true, rate: prev.rate }));

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

  const measured = search.rate > 0;
  const measuredRate = measured ? search.rate : 1e5;
  const tone = (v: number) => (Math.abs(v) <= TOY.eta ? "small" : "big");

  return (
    <section className="advanced-section" id="advanced">
      <div className="lesson-heading">
        <p className="eyebrow">ADVANCED · THE REAL THING</p>
        <h2>Now break<br />a small one.</h2>
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

      <div className="bridge">
        <h4>HOW THIS RELATES TO THE GAME UPSTAIRS</h4>
        <div className="bridge-cols">
          <div>
            <span className="bridge-tag">THE BOARD</span>
            <p>Every dot was a whole-number combination of two vectors — that set of dots is a <b>lattice</b>. You were asked: <b>which dot is nearest HOME?</b> In two dimensions you answer by looking.</p>
          </div>
          <div>
            <span className="bridge-tag">DOWN HERE</span>
            <p>Every combination of <b>A</b>'s entries is a dot of a lattice too. The public key <b>t</b> is <em>not</em> one of those dots — it is a spot parked just off one, pushed there by the error <b>e</b>. The question is: <b>which dot is nearest t?</b> Answer it and you have <b>s</b>.</p>
          </div>
        </div>
        <p className="adv-copy">
          Same lattice, same act, different spot. That is the whole connection, and it is why measuring distances was the right instinct upstairs.
          {geometry && <> In this instance <b>t</b> sits <b>{geometry.nearest.toFixed(1)}</b> from its nearest dot — that gap is exactly the size of <b>e</b> — while the second nearest is <b>{geometry.second.toFixed(1)}</b> away and a typical one is <b>{geometry.typical.toFixed(1)}</b>. It is hugging one dot and nowhere near the rest.</>}
        </p>
        <p className="adv-note">
          Being precise: the board upstairs is the Shortest Vector Problem, ML-KEM rests on Module Learning-With-Errors, and those
          are cousins rather than the same problem. What ties them together is not hand-waving — the best known attacks on
          Learning-With-Errors work by building a lattice out of <b>A</b> and <b>t</b> and hunting for a short vector in it. Finding
          short vectors is the attack. That is why this exhibit spends its time teaching you to look for one.
        </p>
      </div>

      <div className="adv-block">
        <div className="adv-head"><span>01 / BREAK IT</span><h3>A private key small enough to steal</h3></div>
        <p className="adv-copy">
          This is a genuine instance, at n={TOY.n}, k={TOY.k}, q={TOY.q}. Numbers are polynomial coefficients and all arithmetic is
          mod {TOY.q}. Everything in the first panel is public — it is exactly, and only, what an eavesdropper gets.
          The secret <b>s</b> is {coefficientCount} coefficients, each −1, 0 or +1, so there are just <b>{formatSpace(TOY)}</b> possible private keys.
        </p>

        <div className="symbols">
          <div><b>A</b><span>a public recipe for mixing numbers</span><i className="pub">PUBLIC</i></div>
          <div><b>s</b><span>a small secret — this is the private key</span><i className="pri">PRIVATE</i></div>
          <div><b>e</b><span>a small random error that hides the secret</span><i className="pri">PRIVATE</i></div>
          <div><b>t</b><span>the published result of <b>A·s + e</b></span><i className="pub">PUBLIC</i></div>
        </div>
        <p className="adv-note">
          Two conventions worth knowing before you read the numbers. <b>Mod {TOY.q}</b> means everything wraps around after {TOY.q - 1},
          like a clock face with {TOY.q} positions, so the page sometimes shows a number as −3 rather than {TOY.q - 3} — the same
          position, counted the short way round. And the “learning” in Learning-With-Errors has nothing to do with machine
          learning: it means working out a hidden secret from equations that have been deliberately made slightly wrong.
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
            <div className="coef-head">
              <span>{coefficientCount} coefficients</span>
              <button
                className="clear-guess"
                onClick={() => setGuess(new Array(coefficientCount).fill(0))}
                disabled={guess.every((v) => v === 0)}
              >CLEAR</button>
            </div>
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

            <h4 className="spaced">THE TEST · t − A·s <em>— how far t sits from this dot</em></h4>
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
          Only the size of the polynomials grows. Times use the rate your browser {measured ? "measured" : "would be assumed to manage until you run the search above"}.
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
        {(() => {
          const p = LADDER[rung];
          const logFraction = Math.log10(measuredRate) - spaceLog10(p);
          const percent = Math.min(100, 10 ** logFraction * 100);
          return (
            <div className="rung-payout">
              <h4>AT THIS SIZE</h4>
              <p className="adv-note">
                The secret is {p.n * p.k} slots, each holding one of {alphabet(p)} values — <b>{formatSpace(p)}</b> possible keys.
                At the {Math.round(measuredRate).toLocaleString("en-US")} keys per second your browser {measured ? "measured" : "is assumed to manage"}, one second of
                searching covers this much of it:
              </p>
              <div className="scale-bar"><i style={{ width: `${Math.max(percent, 0)}%` }} /></div>
              <p className="adv-note">
                {percent >= 100
                  ? "All of it, with time to spare."
                  : percent < 0.000001
                    ? "The bar is drawn to scale. There is nothing to draw."
                    : `${percent.toPrecision(2)}% of it.`}
              </p>
            </div>
          );
        })()}
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
  ms: number;
};

function Instrument() {
  const [paramSet, setParamSet] = useState<ParamName>("ML-KEM-512");
  const [session, setSession] = useState<Session | null>(null);
  const [tampered, setTampered] = useState<{ k: Uint8Array; at: number } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  function run() {
    try {
      const t0 = performance.now();
      const { ek, dk } = keyGen(paramSet, randomBytes);
      const { c, k } = encaps(ek, paramSet, randomBytes);
      const kReceiver = decaps(dk, c, paramSet);
      setSession({ paramSet, ek, dk, c, kSender: k, kReceiver, ms: performance.now() - t0 });
      setTampered(null);
      setFailure(null);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    }
  }

  // Tamper with the ciphertext that is actually on screen, not a fresh exchange.
  function tamper() {
    if (!session) return;
    try {
      const bad = Uint8Array.from(session.c);
      const at = Math.floor(Math.random() * bad.length);
      bad[at] ^= 1;
      setTampered({ k: decaps(session.dk, bad, session.paramSet), at });
      setFailure(null);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    }
  }

  const size = sizes(paramSet);
  const k = size.k;
  const agree = session !== null && hex(session.kSender, 32) === hex(session.kReceiver, 32);

  return (
    <div className="adv-block">
      <div className="adv-head"><span>03 / THE REAL THING</span><h3>ML-KEM, running here</h3></div>

      <div className="stakes">
        <span>WHAT THIS IS FOR</span>
        <p>
          Two people who have never met need one shared secret, and the only channel between them is one an eavesdropper is
          reading in full. They cannot simply send the secret — that is the whole problem. What they can do is send a public key
          and a scrambled package, and both arrive at the same 32 bytes anyway. Everything below is real: this is ML-KEM, the
          FIPS 203 algorithm, implemented in this page and checked against all 54 of NIST's published test vectors.
        </p>
      </div>

      <div className="param-switch" role="group" aria-label="Parameter set">
        {(["ML-KEM-512", "ML-KEM-768", "ML-KEM-1024"] as ParamName[]).map((p) => (
          <button key={p} className={p === paramSet ? "on" : ""} onClick={() => { setParamSet(p); setSession(null); setTampered(null); setFailure(null); }} aria-pressed={p === paramSet}>{p}</button>
        ))}
      </div>

      <div className="adv-actions">
        <button className="primary-button" onClick={run}>{session ? "RUN IT AGAIN" : "RUN THE EXCHANGE"}<span>→</span></button>
        <button className="ghost-button" onClick={tamper} disabled={!session}>FLIP ONE BIT OF THE CIPHERTEXT</button>
      </div>

      {failure && (
        <p className="adv-note run-failed">This exchange could not run: {failure}.</p>
      )}

      {!session && <p className="adv-note">Nothing has run yet. Press the button and every value below is filled in from a real exchange.</p>}

      <div className="wire-group is-public">
        <h4>SENT IN THE CLEAR · AN EAVESDROPPER GETS ALL OF THIS</h4>
        <div className="kv">
          <div>
            <span>t <em>— the public key</em></span>
            <strong>{session ? hex(session.ek.subarray(0, 384 * k)) : "—"}</strong>
            <em>{384 * k} bytes</em>
          </div>
          <div>
            <span>&rho; <em>— seed that rebuilds A</em></span>
            <strong>{session ? hex(session.ek.subarray(384 * k), 8) : "—"}</strong>
            <em>32 bytes</em>
          </div>
          <div>
            <span>c <em>— the scrambled package</em></span>
            <strong>{session ? hex(session.c) : "—"}</strong>
            <em>{size.c} bytes</em>
          </div>
        </div>
        <p className="adv-note">
          The first two together are the encapsulation key, {size.ek} bytes. That <b>t</b> is the same kind of object you broke
          above — a public key with a small secret hidden inside it — and <b>&rho;</b> is the seed both sides expand into the
          shared matrix <b>A</b>, so it never has to be transmitted. The difference is only size: recovering this <b>s</b> is the
          bottom row of the table above.
        </p>
      </div>

      <div className="wire-group is-private">
        <h4>NEVER SENT · THIS IS WHAT THE WIRE NEVER CARRIES</h4>
        <div className="kv">
          <div>
            <span>s <em>— receiver's private key</em></span>
            <strong className="private">{session ? hex(session.dk.subarray(0, 384 * k)) : "—"}</strong>
            <em>inside {size.dk} bytes</em>
          </div>
          <div>
            <span>SENDER'S SHARED SECRET</span>
            <strong className={agree ? "hit" : ""}>{session ? hex(session.kSender, 16) : "—"}</strong>
            <em>32 bytes</em>
          </div>
          <div>
            <span>RECEIVER'S SHARED SECRET</span>
            <strong className={agree ? "hit" : ""}>{session ? hex(session.kReceiver, 16) : "—"}</strong>
            <em>{session ? (agree ? "identical" : "MISMATCH") : "32 bytes"}</em>
          </div>
        </div>
        {session && (
          <p className="adv-note">
            Both sides hold the same 32 bytes after {session.ms.toFixed(1)} ms, and neither ever put them on the wire. An
            eavesdropper who copied every byte in the panel above cannot produce them, because doing so means recovering
            <b> s</b> from <b>t</b> — the problem you just watched run out of universe.
          </p>
        )}
      </div>

      {tampered && session && (
        <div className="tamper">
          <h4>ONE BIT FLIPPED IN c, AT BYTE {tampered.at}</h4>
          <div className="kv">
            <div>
              <span>RECEIVER NOW DERIVES</span>
              <strong className="wrong">{hex(tampered.k, 16)}</strong>
              <em>instead of {hex(session.kReceiver, 6)}</em>
            </div>
          </div>
          <p className="adv-note">
            Decapsulation did not fail and did not complain — it returned a different key, derived from a value only the receiver
            holds. An attacker who tampers therefore learns nothing from the outcome, because there is no outcome to read. That
            is implicit rejection, and it is the part of the standard easiest to get quietly wrong.
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
