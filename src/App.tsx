import { useMemo, useRef, useState } from "react";

type Vector = [number, number];

type Level = {
  name: string;
  codename: string;
  brief: string;
  targetTwist: number;
  targetProjection: number;
  initialTwist: number;
  initialProjection: number;
  basisU: Vector;
  basisV: Vector;
  shortest: Vector;
  seed: number;
  noise: number;
};

const LEVELS: Level[] = [
  {
    name: "First light",
    codename: "FIELD 01",
    brief: "The pattern is close. Settle the field, then choose its shortest jump.",
    targetTwist: 8,
    targetProjection: 62,
    initialTwist: -24,
    initialProjection: 18,
    basisU: [68, 10],
    basisV: [42, 55],
    shortest: [1, -1],
    seed: 3,
    noise: 22,
  },
  {
    name: "Crosswind",
    codename: "FIELD 02",
    brief: "A harder gust has bent the rows. Find the calm view hidden inside it.",
    targetTwist: -13,
    targetProjection: 38,
    initialTwist: 22,
    initialProjection: 78,
    basisU: [60, 32],
    basisV: [-2, 66],
    shortest: [0, 1],
    seed: 8,
    noise: 29,
  },
  {
    name: "Deep fog",
    codename: "FIELD 03",
    brief: "The signal is almost buried. Read the structure, not the scattered dots.",
    targetTwist: 17,
    targetProjection: 74,
    initialTwist: -17,
    initialProjection: 26,
    basisU: [74, 8],
    basisV: [34, 50],
    shortest: [1, -1],
    seed: 15,
    noise: 36,
  },
];

const CANDIDATES: Vector[] = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, -1], [-1, 1], [1, 1], [-1, -1],
];

function sameDirection(a: Vector, b: Vector) {
  return (a[0] === b[0] && a[1] === b[1]) ||
    (a[0] === -b[0] && a[1] === -b[1]);
}

function hashNoise(a: number, b: number, seed: number) {
  const x = Math.sin(a * 127.1 + b * 311.7 + seed * 41.3) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

function formatScore(score: number) {
  return Math.max(0, score).toString().padStart(4, "0");
}

export default function Home() {
  const [levelIndex, setLevelIndex] = useState(0);
  const [twist, setTwist] = useState(LEVELS[0].initialTwist);
  const [projection, setProjection] = useState(LEVELS[0].initialProjection);
  const [score, setScore] = useState(3600);
  const [solved, setSolved] = useState(false);
  const [complete, setComplete] = useState(false);
  const [feedback, setFeedback] = useState("Move both controls until the field settles.");
  const [pulse, setPulse] = useState(false);
  const [wrongPick, setWrongPick] = useState<Vector | null>(null);
  const pulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const level = LEVELS[levelIndex];
  const twistError = Math.abs(twist - level.targetTwist);
  const projectionError = Math.abs(projection - level.targetProjection);
  const clarity = Math.max(0, Math.min(100, 100 - twistError * 1.65 - projectionError * 0.82));
  const aligned = twistError <= 3 && projectionError <= 5;

  const points = useMemo(() => {
    const result: Array<{ i: number; j: number; x: number; y: number }> = [];
    const theta = ((twist - level.targetTwist) * Math.PI) / 180;
    const shear = (projection - level.targetProjection) / 100;
    const noiseScale = level.noise * (1 - clarity / 118);

    for (let i = -4; i <= 4; i += 1) {
      for (let j = -4; j <= 4; j += 1) {
        const baseX = i * level.basisU[0] + j * level.basisV[0];
        const baseY = i * level.basisU[1] + j * level.basisV[1];
        const projectedX = baseX + shear * baseY * 1.12;
        const projectedY = baseY * (1 - Math.abs(shear) * 0.18);
        const rotatedX = projectedX * Math.cos(theta) - projectedY * Math.sin(theta);
        const rotatedY = projectedX * Math.sin(theta) + projectedY * Math.cos(theta);
        result.push({
          i,
          j,
          x: 300 + rotatedX + hashNoise(i, j, level.seed) * noiseScale,
          y: 280 + rotatedY + hashNoise(j, i, level.seed + 9) * noiseScale,
        });
      }
    }
    return result;
  }, [clarity, level, projection, twist]);

  const pointMap = useMemo(
    () => new Map(points.map((point) => [`${point.i},${point.j}`, point])),
    [points],
  );
  const origin = pointMap.get("0,0") ?? { x: 300, y: 280 };

  function updateTwist(value: number) {
    setTwist(value);
    setSolved(false);
    setWrongPick(null);
    setFeedback("Watch the rows—not any single dot.");
  }

  function updateProjection(value: number) {
    setProjection(value);
    setSolved(false);
    setWrongPick(null);
    setFeedback("Compress the fog until the spacing feels even.");
  }

  function chooseVector(vector: Vector) {
    if (!aligned || solved) return;
    if (sameDirection(vector, level.shortest)) {
      setSolved(true);
      setWrongPick(null);
      setScore((value) => value + Math.round(clarity * 2));
      setFeedback("Clean hit. The shortest jump cuts through the noise.");
    } else {
      setWrongPick(vector);
      setScore((value) => value - 120);
      setFeedback("That route is longer. Compare the nearest rays and try again.");
    }
  }

  function usePulse() {
    if (pulseTimer.current) clearTimeout(pulseTimer.current);
    setPulse(true);
    setScore((value) => value - 220);
    setFeedback("The hidden hint is lighting the way—for a moment.");
    pulseTimer.current = setTimeout(() => setPulse(false), 2200);
  }

  function nextLevel() {
    if (levelIndex === LEVELS.length - 1) {
      setComplete(true);
      return;
    }
    const nextIndex = levelIndex + 1;
    const next = LEVELS[nextIndex];
    setLevelIndex(nextIndex);
    setTwist(next.initialTwist);
    setProjection(next.initialProjection);
    setSolved(false);
    setWrongPick(null);
    setPulse(false);
    setFeedback("Move both controls until the field settles.");
  }

  function restart() {
    const first = LEVELS[0];
    setLevelIndex(0);
    setTwist(first.initialTwist);
    setProjection(first.initialProjection);
    setScore(3600);
    setSolved(false);
    setComplete(false);
    setPulse(false);
    setWrongPick(null);
    setFeedback("Move both controls until the field settles.");
  }

  return (
    <main className="site-shell">
      <nav className="topbar" aria-label="Main navigation">
        <a className="brand" href="#game" aria-label="Lattice Builder home">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span>
          <span>LATTICE / BUILDER</span>
        </a>
        <div className="topbar-meta"><span className="live-dot" />PLAYABLE EXHIBIT</div>
      </nav>

      <section className="game-section" id="game">
        <header className="game-intro">
          <p className="eyebrow">CRYPTO LAB · EXPERIMENT 176</p>
          <h1>Find the signal<br />in the noise.</h1>
          <p>Twist the view. Settle the field. Then trust your eyes and choose the shortest jump.</p>
        </header>

        <div className="game-frame">
          <div className="game-hud">
            <div><span>SECTOR</span><strong>{String(levelIndex + 1).padStart(2, "0")} / 03</strong></div>
            <div className="progress-track" aria-label={`Sector ${levelIndex + 1} of 3`}>
              {LEVELS.map((item, index) => (
                <span className={index < levelIndex || (index === levelIndex && solved) ? "done" : index === levelIndex ? "active" : ""} key={item.codename} />
              ))}
            </div>
            <div className="score-readout"><span>SIGNAL</span><strong>{formatScore(score)}</strong></div>
          </div>

          <div className="game-grid">
            <section className="field-panel" aria-label="Interactive lattice field">
              <div className="field-label"><span>{level.codename}</span><span>{aligned ? "PATTERN LOCKED" : "SEARCHING"}</span></div>
              <svg
                className={`lattice-board ${aligned ? "is-aligned" : ""}`}
                viewBox="0 0 600 560"
                role="img"
                aria-label={aligned ? "Aligned dot field. Choose the shortest ray from the center." : "A noisy dot field that responds to the two controls."}
              >
                <defs>
                  <radialGradient id="fieldGlow" cx="50%" cy="47%" r="52%">
                    <stop offset="0%" stopColor="#18384a" stopOpacity=".44" />
                    <stop offset="100%" stopColor="#071014" stopOpacity="0" />
                  </radialGradient>
                  <filter id="softGlow" x="-100%" y="-100%" width="300%" height="300%">
                    <feGaussianBlur stdDeviation="5" result="blur" />
                    <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                  </filter>
                  <pattern id="microGrid" width="24" height="24" patternUnits="userSpaceOnUse">
                    <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#b8d6d0" strokeOpacity=".045" strokeWidth="1" />
                  </pattern>
                </defs>
                <rect width="600" height="560" fill="url(#fieldGlow)" />
                <rect width="600" height="560" fill="url(#microGrid)" />
                <circle cx="300" cy="280" r="198" className="scanner-ring ring-one" />
                <circle cx="300" cy="280" r="132" className="scanner-ring ring-two" />

                <g className="lattice-lines" aria-hidden="true">
                  {points.flatMap((point) => {
                    const nextI = pointMap.get(`${point.i + 1},${point.j}`);
                    const nextJ = pointMap.get(`${point.i},${point.j + 1}`);
                    return [
                      nextI ? <line key={`i-${point.i}-${point.j}`} x1={point.x} y1={point.y} x2={nextI.x} y2={nextI.y} /> : null,
                      nextJ ? <line key={`j-${point.i}-${point.j}`} x1={point.x} y1={point.y} x2={nextJ.x} y2={nextJ.y} /> : null,
                    ];
                  })}
                </g>
                <g className="lattice-points" aria-hidden="true">
                  {points.map((point) => {
                    const distance = Math.hypot(point.x - 300, point.y - 280);
                    if (distance > 305) return null;
                    return <circle key={`${point.i}-${point.j}`} cx={point.x} cy={point.y} r={point.i === 0 && point.j === 0 ? 5.5 : 3.1} opacity={Math.max(0.2, 1 - distance / 390)} />;
                  })}
                </g>

                {aligned && (
                  <g className="vector-layer">
                    {CANDIDATES.map((vector) => {
                      const endpoint = pointMap.get(`${vector[0]},${vector[1]}`);
                      if (!endpoint) return null;
                      const isHint = pulse && sameDirection(vector, level.shortest);
                      const isWrong = wrongPick && vector[0] === wrongPick[0] && vector[1] === wrongPick[1];
                      const isCorrect = solved && sameDirection(vector, level.shortest);
                      return (
                        <g
                          className={`vector-choice ${isHint ? "is-hint" : ""} ${isWrong ? "is-wrong" : ""} ${isCorrect ? "is-correct" : ""}`}
                          key={`${vector[0]}-${vector[1]}`}
                          role="button"
                          tabIndex={0}
                          aria-label="Choose this route"
                          onClick={() => chooseVector(vector)}
                          onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") chooseVector(vector); }}
                        >
                          <line x1={origin.x} y1={origin.y} x2={endpoint.x} y2={endpoint.y} />
                          <circle className="hit-area" cx={endpoint.x} cy={endpoint.y} r="18" />
                          <circle className="route-node" cx={endpoint.x} cy={endpoint.y} r="6" />
                        </g>
                      );
                    })}
                    <circle className="origin-pulse" cx={origin.x} cy={origin.y} r="17" />
                    <circle className="origin-core" cx={origin.x} cy={origin.y} r="7" />
                  </g>
                )}

                {!aligned && (
                  <g className="search-reticle" aria-hidden="true">
                    <path d="M276 280h-18M342 280h-18M300 256v-18M300 322v-18" />
                    <circle cx="300" cy="280" r="29" />
                  </g>
                )}
              </svg>

              <div className={`field-message ${aligned ? "ready" : ""}`}>
                <span className="message-icon">{solved ? "✓" : aligned ? "◎" : "⌁"}</span>
                <div>
                  <strong>{solved ? "VECTOR FOUND" : aligned ? "FIELD SETTLED" : "READ THE PATTERN"}</strong>
                  <p>{feedback}</p>
                </div>
              </div>

              {complete && (
                <div className="completion-card" role="dialog" aria-label="Mission complete">
                  <p>ALL THREE FIELDS CLEARED</p>
                  <h2>You found structure<br />inside the fog.</h2>
                  <div className="final-score"><span>FINAL SIGNAL</span><strong>{formatScore(score)}</strong></div>
                  <button className="primary-button" onClick={restart}>PLAY AGAIN</button>
                </div>
              )}
            </section>

            <aside className="control-panel">
              <div className="mission-block">
                <div className="mission-number">0{levelIndex + 1}</div>
                <div><p>{level.codename}</p><h2>{level.name}</h2></div>
              </div>
              <p className="mission-brief">{level.brief}</p>

              <div className="instruction-strip">
                <div className={!aligned ? "current" : "complete-step"}><span>1</span><p><strong>SETTLE</strong> Make the rows clean and even.</p></div>
                <div className={aligned && !solved ? "current" : solved ? "complete-step" : ""}><span>2</span><p><strong>CHOOSE</strong> Tap the shortest ray from center.</p></div>
              </div>

              <div className="controls">
                <label>
                  <span className="control-title"><b>TWIST</b><output>{twist > 0 ? "+" : ""}{twist}°</output></span>
                  <span className="range-wrap">
                    <input type="range" min="-30" max="30" step="1" value={twist} aria-label="Twist the field" onChange={(event) => updateTwist(Number(event.target.value))} />
                    {pulse && <i className="target-notch" style={{ left: `${((level.targetTwist + 30) / 60) * 100}%` }} />}
                  </span>
                  <small>TURN THE VIEW</small>
                </label>

                <label>
                  <span className="control-title"><b>DEPTH</b><output>{projection}%</output></span>
                  <span className="range-wrap">
                    <input type="range" min="0" max="100" step="1" value={projection} aria-label="Compress the field depth" onChange={(event) => updateProjection(Number(event.target.value))} />
                    {pulse && <i className="target-notch" style={{ left: `${level.targetProjection}%` }} />}
                  </span>
                  <small>COMPRESS THE FOG</small>
                </label>
              </div>

              <div className="clarity-block">
                <div className="clarity-label"><span>FIELD CLARITY</span><strong>{Math.round(clarity)}%</strong></div>
                <div className="clarity-meter"><i style={{ width: `${clarity}%` }} /></div>
                <p>{aligned ? "The hidden grid is holding steady." : clarity > 70 ? "Almost there. Make smaller moves." : "Follow the rows as they begin to agree."}</p>
              </div>

              {solved ? (
                <button className="primary-button" onClick={nextLevel}>
                  {levelIndex === LEVELS.length - 1 ? "FINISH RUN" : "ENTER NEXT FIELD"}<span>→</span>
                </button>
              ) : (
                <button className="pulse-button" onClick={usePulse} disabled={pulse}>
                  <span className="key-cap">H</span>
                  <span><strong>USE HIDDEN HINT</strong><small>−220 SIGNAL</small></span>
                  <span className="pulse-glyph">⌁</span>
                </button>
              )}
              <p className="hint-copy">A hidden hint makes the search easy—but a little less rewarding.</p>
            </aside>
          </div>
        </div>
      </section>

      <section className="lesson-section" id="behind-the-puzzle">
        <div className="lesson-heading">
          <p className="eyebrow">BEHIND THE PUZZLE</p>
          <h2>The shape was always there.</h2>
          <p>Cryptography can hide a clean structure under distortion and noise. Without the right hint, finding the useful short route becomes a huge search.</p>
        </div>
        <div className="lesson-grid">
          <article><span className="lesson-icon"><i className="dots-icon" /></span><p>01 / DISTORT</p><h3>Scatter the view</h3><p>A regular pattern becomes difficult to read when many tiny shifts pile up.</p></article>
          <article><span className="lesson-icon"><i className="route-icon" /></span><p>02 / SEARCH</p><h3>Find the short route</h3><p>Short connections are easy to spot here. Add dimensions, and the choices explode.</p></article>
          <article><span className="lesson-icon"><i className="key-icon" /></span><p>03 / UNLOCK</p><h3>Use the hidden hint</h3><p>The secret does not remove the noise. It gives you a better way to navigate it.</p></article>
        </div>

        <div className="honesty-note">
          <span>MODEL NOTE</span>
          <p>This is a tactile analogy, not a simulation of ML-KEM. Real ML-KEM uses high-dimensional module-lattice arithmetic and the hardness of learning from noisy relationships—not a literal 2D dot hunt. The game preserves the core intuition: simple hidden structure, deliberate noise, and a secret that changes an overwhelming search into a manageable one.</p>
        </div>
      </section>

      <footer>
        <a className="brand" href="#game"><span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span><span>LATTICE / BUILDER</span></a>
        <p>A playable introduction to lattice-based cryptography.</p>
        <a href="#game">RUN IT AGAIN ↑</a>
      </footer>
    </main>
  );
}
