import { useMemo, useState } from "react";
import {
  DIMENSIONS,
  PUBLIC,
  SECRET,
  SHORTEST_IN_PUBLIC,
  angleBetween,
  combine,
  decodeTrial,
  det,
  len,
  neighbourCount,
  neighbours,
  shortestVisible,
  trueShortest,
  type Basis,
  type Vec,
} from "./basis";

const SCALE = 0.62;
const CX = 300;
const CY = 230;
const REACH = 260;

const sx = (v: Vec) => CX + v[0] * SCALE;
const sy = (v: Vec) => CY + v[1] * SCALE;

export default function ExpertMode() {
  const [useSecret, setUseSecret] = useState(false);
  const [trials, setTrials] = useState<number>(0);

  const basis: Basis = useSecret ? SECRET : PUBLIC;

  // One point set, drawn once. Switching the basis changes only how it is named.
  const points = useMemo(() => {
    const out: Vec[] = [];
    for (let i = -22; i <= 22; i += 1) {
      for (let j = -22; j <= 22; j += 1) {
        const v = combine(SECRET, i, j);
        if (len(v) * SCALE <= REACH) out.push(v);
      }
    }
    return out;
  }, []);

  const visible = shortestVisible(basis);
  const truth = useMemo(() => trueShortest(SECRET), []);
  const ring = useMemo(() => neighbours(basis), [basis]);

  const decode = useMemo(() => {
    if (trials === 0) return null;
    let s = 0;
    let p = 0;
    const rows = [];
    for (let i = 0; i < trials; i += 1) {
      const t = decodeTrial(i);
      if (t.secretOk) s += 1;
      if (t.publicOk) p += 1;
      if (rows.length < 4 && !t.publicOk) rows.push(t);
    }
    return { s, p, rows };
  }, [trials]);

  return (
    <section className="expert-section" id="expert">
      <div className="lesson-heading">
        <p className="eyebrow">EXPERT · WHY THE DESCRIPTION MATTERS</p>
        <h2>A basis<br />is a lens.</h2>
        <p>One set of dots, two ways of naming them, and the difference between seeing the answer and not. This is what an attacker spends their effort trying to build, and it is why the word “hard” in lattice cryptography means something specific.</p>
      </div>

      <div className="correction">
        <h4>FIRST, WHAT THIS IS NOT</h4>
        <p>
          An ML-KEM private key is <b>not</b> what this section shows. Its secret is the small list of numbers <b>s</b> you saw in
          the section above — nothing more exotic. What follows is background: it explains why a lattice problem can be easy or
          impossible depending on how the lattice is written down, which is the thing an attacker is trying to change and the
          reason “hard” is a meaningful claim about ML-KEM. Worth understanding; not the shape of the key.
        </p>
      </div>

      <div className="adv-block">
        <div className="adv-head"><span>04 / THE SAME DOTS</span><h3>One lattice, two descriptions</h3></div>
        <p className="adv-copy">
          Every dot below is a whole-number combination of two vectors. Both descriptions on offer generate <b>exactly</b> this set
          of dots — nothing is added or removed when you switch, and you can watch the field stay still. What changes is which dots
          are one step away.
        </p>

        <div className="expert-grid">
          <div className="expert-board">
            <svg viewBox="0 0 600 460" role="img" aria-label={`Lattice shown through the ${basis.name.toLowerCase()} basis`}>
              <g className="ex-dots" aria-hidden="true">
                {points.map((v, i) => <circle key={i} cx={sx(v)} cy={sy(v)} r={2.2} />)}
              </g>
              <g className="ex-ring" aria-hidden="true">
                {ring.map((n, i) => {
                  const isBest = i === 0;   // ring is sorted; its antipode has the same length
                  const away = Math.max(len(n.vec) * SCALE, 1);
                  return (
                    <g key={i} className={isBest ? "best" : ""}>
                      <line x1={CX} y1={CY} x2={sx(n.vec)} y2={sy(n.vec)} />
                      <circle cx={sx(n.vec)} cy={sy(n.vec)} r={isBest ? 8 : 6.5} />
                      {isBest && (
                        <text x={sx(n.vec) + (n.vec[0] * SCALE / away) * 22} y={sy(n.vec) + (n.vec[1] * SCALE / away) * 22 + 4}>
                          {n.length.toFixed(1)}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
              <g className="ex-basis" aria-hidden="true">
                <line x1={CX} y1={CY} x2={sx(basis.u)} y2={sy(basis.u)} />
                <line x1={CX} y1={CY} x2={sx(basis.v)} y2={sy(basis.v)} />
                {([[basis.u, useSecret ? "g₁" : "b₁"], [basis.v, useSecret ? "g₂" : "b₂"]] as [Vec, string][]).map(([vec, label]) => {
                  const l = Math.max(len(vec), 1);
                  const px = (-vec[1] / l) * 18;
                  const py = (vec[0] / l) * 18;
                  return <text key={label} x={sx(vec) + px} y={sy(vec) + py + 4}>{label}</text>;
                })}
              </g>
              {!useSecret && (
                <g className="ex-truth">
                  <line x1={CX} y1={CY} x2={sx(truth.vec)} y2={sy(truth.vec)} />
                  <circle cx={sx(truth.vec)} cy={sy(truth.vec)} r={7} />
                  <text x={sx(truth.vec) + 16} y={sy(truth.vec) - 12}>the real shortest — {truth.length.toFixed(1)}</text>
                </g>
              )}
              <circle className="ex-home" cx={CX} cy={CY} r={5.5} />
              <text className="ex-home-label" x={CX} y={CY + 40}>HOME</text>
            </svg>
            <div className="lens-switch" role="group" aria-label="Which description to look through">
              <button className={!useSecret ? "on" : ""} onClick={() => setUseSecret(false)} aria-pressed={!useSecret}>PUBLIC DESCRIPTION</button>
              <button className={useSecret ? "on" : ""} onClick={() => setUseSecret(true)} aria-pressed={useSecret}>SECRET DESCRIPTION</button>
            </div>
          </div>

          <div className="adv-panel">
            <h4>{useSecret ? "THE SECRET DESCRIPTION" : "THE PUBLIC DESCRIPTION"}</h4>
            <div className="adv-readout">
              <div><span>SHORTEST STEP YOU CAN SEE</span><strong className={useSecret ? "hit" : ""}>{visible.length.toFixed(1)}</strong></div>
              <div><span>ANGLE BETWEEN THE VECTORS</span><strong>{angleBetween(basis).toFixed(0)}°</strong></div>
            </div>
            <p className="adv-note">
              Lengths {len(basis.u).toFixed(0)} and {len(basis.v).toFixed(0)}. Both descriptions have determinant {Math.abs(det(basis))},
              which is what proves they cover the same dots — the cells have identical area, so nothing is missed.
            </p>

            {useSecret ? (
              <p className="adv-copy">
                Short vectors, nearly at right angles. The eight one-step neighbours now include the genuine shortest vector in the
                whole lattice, <b>{truth.length.toFixed(1)}</b>. You can just look at it. Nothing was added; only the way of
                naming the dots changed.
              </p>
            ) : (
              <p className="adv-copy">
                Long vectors, {angleBetween(PUBLIC).toFixed(0)}° apart — almost the same direction. The best of the eight is{" "}
                <b>{visible.length.toFixed(1)}</b>, but the true shortest is <b>{truth.length.toFixed(1)}</b>, marked on the board.
                It is a lattice point like any other; through this description it sits at{" "}
                <b>{SHORTEST_IN_PUBLIC[0]}·b₁ − {Math.abs(SHORTEST_IN_PUBLIC[1])}·b₂</b> — nowhere near one step out. The eight
                dots cannot find it, and this description overstates the answer by{" "}
                <b>{(visible.length / truth.length).toFixed(1)}×</b>.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="adv-block">
        <div className="adv-head"><span>05 / WHAT A GOOD DESCRIPTION BUYS</span><h3>Decoding with each one</h3></div>
        <p className="adv-copy">
          A short description is not a trophy — it is a working tool. Take a point that sits slightly off the lattice, write it in
          a description's own coordinates, round each coordinate to a whole number, and rebuild. With short, near-square vectors that
          lands on the nearest dot. With long, skewed ones it misses. Same algorithm either way; only the description differs.
        </p>
        <button className="primary-button" onClick={() => setTrials(400)}>DECODE 400 OFF-LATTICE POINTS<span>→</span></button>
        {decode && (
          <>
            <div className="adv-readout wide">
              <div><span>SECRET DESCRIPTION</span><strong className="hit">{decode.s} / {trials}</strong></div>
              <div><span>PUBLIC DESCRIPTION</span><strong className="wrong">{decode.p} / {trials}</strong></div>
            </div>
            <div className="decode-rows">
              {decode.rows.map((r, i) => (
                <div className="decode-row" key={i}>
                  <span>({r.target.join(", ")})</span>
                  <em>sits {len(r.offset).toFixed(1)} from dot ({r.truth.join(", ")})</em>
                  <b className="ok">secret → ({r.secret.join(", ")})</b>
                  <b className="bad">public → ({r.publicGuess.join(", ")})</b>
                </div>
              ))}
            </div>
            <p className="adv-note">
              Same lattice, same targets, same rounding. The only difference is which description does the arithmetic — and the
              long, skewed one lands on a dot hundreds of units away. Anyone able to turn the second description into the first could do this too, which is exactly what an attack on a lattice scheme is trying to achieve.
            </p>
          </>
        )}
      </div>

      <div className="adv-block">
        <div className="adv-head"><span>06 / WHY TWO DIMENSIONS LIE</span><h3>Eight dots is 3² − 1</h3></div>
        <p className="adv-copy">
          The eight dots were never an arbitrary number. They are every non-zero combination of two vectors with coefficients
          −1, 0 or +1 — that is 3² − 1 = 8. The same definition in d dimensions gives 3<sup>d</sup> − 1, and that is what you would
          have to look at to pick the nearest by eye.
        </p>
        <div className="ladder">
          <div className="ladder-row is-head"><span>DIMENSIONS</span><span>ONE-STEP NEIGHBOURS</span><span></span></div>
          {DIMENSIONS.map((d) => (
            <div className={`ladder-row static ${d === 512 ? "is-real" : ""}`} key={d}>
              <span><b>d = {d}</b>{d === 2 ? " — the board upstairs" : d === 512 ? " — ML-KEM-512" : ""}</span>
              <span>{neighbourCount(d)}</span>
              <span>{d === 2 ? "you can look at all of them" : d <= 8 ? "still countable" : d <= 64 ? "no" : "there is nothing to look at"}</span>
            </div>
          ))}
        </div>
        <p className="adv-note">
          Turning a long, skewed description into a short, square one is called lattice
          reduction, and it is the main tool in every serious attack on a lattice scheme. In two dimensions it is quick and exact, which is why everything above was a party piece. As the dimension climbs the best known reduction algorithms cost more than
          the security level they are attacking, which is precisely the bet ML-KEM's parameters are chosen to win.
        </p>
      </div>
    </section>
  );
}
