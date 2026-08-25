import { useEffect, useMemo, useRef, useState } from "react";
import { createSound, type Sound } from "./sound";
import {
  CAMPAIGN_LEVELS,
  CANDIDATES,
  latticeLength,
  makeDailyLevels,
  sameDirection,
  shortestOf,
  todayKey,
  type Level,
  type Vector,
} from "./lattice";

type Mode = "campaign" | "daily";
type SectorRecord = { wrong: number; hint: boolean; perfect: boolean };

const TWIST_TOL = 3;
const PROJECTION_TOL = 5;
const START_SIGNAL = 3600;
const HINT_COST = 220;
const SITE_URL = "https://systemslibrarian.github.io/crypto-lab-lattice-builder/";
const OPENING_LINE = "Move both controls until the field settles.";

function formatScore(score: number) {
  return Math.max(0, score).toString().padStart(4, "0");
}

function hashNoise(a: number, b: number, seed: number) {
  const x = Math.sin(a * 127.1 + b * 311.7 + seed * 41.3) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function directionKey(vector: Vector) {
  const flip = vector[0] < 0 || (vector[0] === 0 && vector[1] < 0);
  const x = flip ? -vector[0] : vector[0];
  const y = flip ? -vector[1] : vector[1];
  return `${x},${y}`;
}

function readStore(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStore(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* private mode or blocked storage — scores simply do not persist */
  }
}

function buzz(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported */
  }
}

function glyphFor(record: SectorRecord) {
  if (record.hint) return "◇";
  if (record.wrong > 0) return "◈";
  return "◆";
}

export default function Home() {
  const [dayKey] = useState(() => todayKey());
  const [mode, setMode] = useState<Mode>("campaign");
  const levels = useMemo(
    () => (mode === "daily" ? makeDailyLevels(dayKey) : CAMPAIGN_LEVELS),
    [dayKey, mode],
  );

  const [levelIndex, setLevelIndex] = useState(0);
  const [twist, setTwist] = useState(CAMPAIGN_LEVELS[0].initialTwist);
  const [projection, setProjection] = useState(CAMPAIGN_LEVELS[0].initialProjection);
  const [score, setScore] = useState(START_SIGNAL);
  const [solved, setSolved] = useState(false);
  const [complete, setComplete] = useState(false);
  const [feedback, setFeedback] = useState(OPENING_LINE);
  const [pulse, setPulse] = useState(false);
  const [flash, setFlash] = useState(false);
  const [wrongPicks, setWrongPicks] = useState<Vector[]>([]);
  const [hintUsed, setHintUsed] = useState(false);
  const [records, setRecords] = useState<SectorRecord[]>([]);
  const [muted, setMuted] = useState(() => readStore("lb:mute") === "1");
  const [best, setBest] = useState<number | null>(null);
  const [shareStatus, setShareStatus] = useState("");
  const [newBest, setNewBest] = useState(false);

  const pulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const soundRef = useRef<Sound | null>(null);
  const alignedRef = useRef(false);

  const level = levels[levelIndex];
  const bestKey = mode === "daily" ? `lb:daily:${dayKey}` : "lb:best:campaign";

  const twistError = Math.abs(twist - level.targetTwist);
  const projectionError = Math.abs(projection - level.targetProjection);
  const clarity = Math.max(0, Math.min(100, 100 - twistError * 1.65 - projectionError * 0.82));
  const aligned = twistError <= TWIST_TOL && projectionError <= PROJECTION_TOL;
  const perfectLock = twistError === 0 && projectionError === 0;
  const precision = aligned
    ? clamp(Math.min(1 - twistError / TWIST_TOL, 1 - projectionError / PROJECTION_TOL), 0, 1)
    : 0;
  const pickBonus = 240 + Math.round(760 * Math.pow(precision, 1.35));
  const wrongCost = 120 + wrongPicks.length * 110;

  const shortest = useMemo(
    () => shortestOf(level.basisU, level.basisV),
    [level.basisU, level.basisV],
  );

  const revealed = useMemo(() => {
    const keys = new Set(wrongPicks.map(directionKey));
    if (solved) CANDIDATES.forEach((vector) => keys.add(directionKey(vector)));
    return keys;
  }, [solved, wrongPicks]);

  useEffect(() => {
    setBest(Number(readStore(bestKey)) || null);
  }, [bestKey]);

  useEffect(() => {
    return () => {
      if (pulseTimer.current) clearTimeout(pulseTimer.current);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      soundRef.current?.dispose();
    };
  }, []);

  function play(action: (sound: Sound) => void) {
    if (muted) return;
    if (!soundRef.current) soundRef.current = createSound();
    soundRef.current.setMuted(false);
    action(soundRef.current);
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    writeStore("lb:mute", next ? "1" : "0");
    soundRef.current?.setMuted(next);
  }

  useEffect(() => {
    if (aligned && !alignedRef.current && !solved && !complete) {
      setFlash(true);
      play((sound) => sound.lock());
      buzz(18);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlash(false), 760);
    }
    alignedRef.current = aligned;
  }, [aligned, complete, solved]);

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

  function clarityFor(nextTwist: number, nextProjection: number) {
    return Math.max(
      0,
      Math.min(
        100,
        100 -
          Math.abs(nextTwist - level.targetTwist) * 1.65 -
          Math.abs(nextProjection - level.targetProjection) * 0.82,
      ),
    );
  }

  function updateTwist(value: number) {
    if (solved || complete) return;
    const next = clamp(Math.round(value), -30, 30);
    if (next === twist) return;
    setTwist(next);
    play((sound) => sound.tick(clarityFor(next, projection)));
    setFeedback("Watch the rows—not any single dot.");
  }

  function updateProjection(value: number) {
    if (solved || complete) return;
    const next = clamp(Math.round(value), 0, 100);
    if (next === projection) return;
    setProjection(next);
    play((sound) => sound.tick(clarityFor(twist, next)));
    setFeedback("Compress the fog until the spacing feels even.");
  }

  function chooseVector(vector: Vector) {
    if (!aligned || solved || complete) return;
    if (sameDirection(vector, shortest)) {
      const earned = pickBonus;
      setSolved(true);
      setScore((value) => value + earned);
      setRecords((list) => [...list, { wrong: wrongPicks.length, hint: hintUsed, perfect: perfectLock }]);
      play((sound) => sound.correct(perfectLock));
      buzz(perfectLock ? [12, 40, 22] : 24);
      setFeedback(
        perfectLock
          ? `Perfect lock. Dead centre on both controls—full ${earned} signal.`
          : `Clean hit. +${earned} signal. Tighten the lock next time for more.`,
      );
    } else {
      const length = Math.round(latticeLength(vector, level.basisU, level.basisV));
      setWrongPicks((list) => [...list, vector]);
      setScore((value) => value - wrongCost);
      play((sound) => sound.wrong());
      setFeedback(`That ray measures ${length}. It stays on the board—use it to judge the rest.`);
    }
  }

  function usePulse() {
    if (pulse || solved || complete) return;
    if (pulseTimer.current) clearTimeout(pulseTimer.current);
    setPulse(true);
    setHintUsed(true);
    setScore((value) => value - HINT_COST);
    play((sound) => sound.hint());
    setFeedback("The hidden hint is lighting the way—for a moment.");
    pulseTimer.current = setTimeout(() => setPulse(false), 2200);
  }

  function enterLevel(index: number, list: Level[]) {
    const next = list[index];
    setLevelIndex(index);
    setTwist(next.initialTwist);
    setProjection(next.initialProjection);
    setSolved(false);
    setWrongPicks([]);
    setHintUsed(false);
    setPulse(false);
    setFlash(false);
    alignedRef.current = false;
    setFeedback(OPENING_LINE);
  }

  function finishRun() {
    setComplete(true);
    play((sound) => sound.finish());
    buzz(30);
    const stored = Number(readStore(bestKey)) || 0;
    const final = Math.max(0, score);
    if (final > stored) {
      writeStore(bestKey, String(final));
      setBest(final);
      setNewBest(true);
    } else {
      setBest(stored || null);
      setNewBest(false);
    }
  }

  function nextLevel() {
    if (levelIndex === levels.length - 1) {
      finishRun();
      return;
    }
    enterLevel(levelIndex + 1, levels);
  }

  function restart() {
    setScore(START_SIGNAL);
    setComplete(false);
    setRecords([]);
    setShareStatus("");
    setNewBest(false);
    enterLevel(0, levels);
  }

  function switchMode(next: Mode) {
    if (next === mode) return;
    const list = next === "daily" ? makeDailyLevels(dayKey) : CAMPAIGN_LEVELS;
    setMode(next);
    setScore(START_SIGNAL);
    setComplete(false);
    setRecords([]);
    setShareStatus("");
    setNewBest(false);
    enterLevel(0, list);
  }

  function shareRun() {
    const header = mode === "daily" ? `DAILY ${dayKey}` : "CAMPAIGN";
    const glyphs = records.map(glyphFor).join(" ");
    const perfects = records.filter((record) => record.perfect).length;
    const lines = [
      `LATTICE BUILDER · ${header}`,
      `${glyphs}   SIGNAL ${formatScore(score)}`,
    ];
    if (perfects > 0) lines.push(`${perfects} perfect lock${perfects > 1 ? "s" : ""}`);
    lines.push(SITE_URL);
    const text = lines.join("\n");

    const fallback = () => {
      try {
        const area = document.createElement("textarea");
        area.value = text;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        document.body.removeChild(area);
        setShareStatus("COPIED TO CLIPBOARD");
      } catch {
        setShareStatus("COPY UNAVAILABLE");
      }
    };

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => setShareStatus("COPIED TO CLIPBOARD"), fallback);
    } else {
      fallback();
    }
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const inSlider = target?.tagName === "INPUT";
      const key = event.key.toLowerCase();

      if (key === "m") {
        event.preventDefault();
        toggleMute();
        return;
      }
      if (complete) {
        if (key === "enter") {
          event.preventDefault();
          restart();
        }
        return;
      }
      if (key === "h" && !solved) {
        event.preventDefault();
        usePulse();
        return;
      }
      if (key === "enter" && solved) {
        event.preventDefault();
        nextLevel();
        return;
      }
      if (aligned && !solved && /^[1-8]$/.test(key)) {
        event.preventDefault();
        chooseVector(CANDIDATES[Number(key) - 1]);
        return;
      }
      if (inSlider) return;

      const step = event.shiftKey ? 5 : 1;
      if (key === "arrowleft") {
        event.preventDefault();
        updateTwist(twist - step);
      } else if (key === "arrowright") {
        event.preventDefault();
        updateTwist(twist + step);
      } else if (key === "arrowdown") {
        event.preventDefault();
        updateProjection(projection - step);
      } else if (key === "arrowup") {
        event.preventDefault();
        updateProjection(projection + step);
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const statusLabel = solved ? "VECTOR FOUND" : aligned ? "FIELD SETTLED" : "READ THE PATTERN";

  return (
    <main className="site-shell">
      <nav className="topbar" aria-label="Main navigation">
        <a className="brand" href="#game" aria-label="Lattice Builder home">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span>
          <span>LATTICE / BUILDER</span>
        </a>
        <div className="topbar-tools">
          <div className="mode-switch" role="group" aria-label="Run type">
            <button className={mode === "campaign" ? "on" : ""} onClick={() => switchMode("campaign")} aria-pressed={mode === "campaign"}>CAMPAIGN</button>
            <button className={mode === "daily" ? "on" : ""} onClick={() => switchMode("daily")} aria-pressed={mode === "daily"}>DAILY</button>
          </div>
          <button className="sound-toggle" onClick={toggleMute} aria-pressed={!muted} aria-label={muted ? "Turn sound on" : "Turn sound off"}>
            {muted ? "◼ SOUND OFF" : "◗ SOUND ON"}
          </button>
          <div className="topbar-meta"><span className="live-dot" />PLAYABLE EXHIBIT</div>
        </div>
      </nav>

      <section className="game-section" id="game">
        <header className="game-intro">
          <p className="eyebrow">CRYPTO LAB · EXPERIMENT 176</p>
          <h1>Find the signal<br />in the noise.</h1>
          <p>Twist the view. Settle the field. Then trust your eyes and choose the shortest jump.</p>
        </header>

        <div className="game-frame">
          <div className="game-hud">
            <div><span>SECTOR</span><strong>{String(levelIndex + 1).padStart(2, "0")} / 0{levels.length}</strong></div>
            <div className="progress-track" aria-label={`Sector ${levelIndex + 1} of ${levels.length}`}>
              {levels.map((item, index) => (
                <span className={index < levelIndex || (index === levelIndex && solved) ? "done" : index === levelIndex ? "active" : ""} key={`${item.codename}-${index}`} />
              ))}
            </div>
            <div className="score-readout">
              <span>SIGNAL</span><strong>{formatScore(score)}</strong>
              {best !== null && <em>BEST {formatScore(best)}</em>}
            </div>
          </div>

          <div className="game-grid">
            <section className="field-panel" aria-label="Interactive lattice field">
              <div className="field-label">
                <span>{level.codename}{mode === "daily" ? ` · ${dayKey}` : ""}</span>
                <span>{aligned ? "PATTERN LOCKED" : "SEARCHING"}</span>
              </div>
              <svg
                className={`lattice-board ${aligned ? "is-aligned" : ""} ${flash ? "is-snapping" : ""}`}
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

                {flash && <circle className="snap-ring" cx="300" cy="280" r="60" aria-hidden="true" />}

                {aligned && (
                  <g className="vector-layer">
                    {CANDIDATES.map((vector, index) => {
                      const endpoint = pointMap.get(`${vector[0]},${vector[1]}`);
                      if (!endpoint) return null;
                      const isHint = pulse && sameDirection(vector, shortest);
                      const isWrong = wrongPicks.some((pick) => pick[0] === vector[0] && pick[1] === vector[1]);
                      const isCorrect = solved && sameDirection(vector, shortest);
                      const isShown = revealed.has(directionKey(vector));
                      const dx = endpoint.x - origin.x;
                      const dy = endpoint.y - origin.y;
                      const span = Math.hypot(dx, dy) || 1;
                      return (
                        <g
                          className={`vector-choice ${isHint ? "is-hint" : ""} ${isWrong ? "is-wrong" : ""} ${isCorrect ? "is-correct" : ""}`}
                          key={`${vector[0]}-${vector[1]}`}
                          role="button"
                          tabIndex={0}
                          aria-label={`Route ${index + 1}${isShown ? `, length ${Math.round(latticeLength(vector, level.basisU, level.basisV))}` : ""}`}
                          onClick={() => chooseVector(vector)}
                          onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); chooseVector(vector); } }}
                        >
                          <line x1={origin.x} y1={origin.y} x2={endpoint.x} y2={endpoint.y} />
                          <circle className="hit-area" cx={endpoint.x} cy={endpoint.y} r="18" />
                          <circle className="route-node" cx={endpoint.x} cy={endpoint.y} r="9" />
                          <text className="route-index" x={endpoint.x} y={endpoint.y + 3}>{index + 1}</text>
                          {isShown && (
                            <text className="ray-length" x={endpoint.x + (dx / span) * 26} y={endpoint.y + (dy / span) * 26 + 3}>
                              {Math.round(latticeLength(vector, level.basisU, level.basisV))}
                            </text>
                          )}
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

              <div className={`field-message ${aligned ? "ready" : ""}`} aria-live="polite">
                <span className="message-icon">{solved ? "✓" : aligned ? "◎" : "⌁"}</span>
                <div>
                  <strong>{statusLabel}{perfectLock && !solved ? " · PERFECT" : ""}</strong>
                  <p>{feedback}</p>
                </div>
              </div>

              {complete && (
                <div className="completion-card" role="dialog" aria-label="Mission complete">
                  <p>ALL {levels.length} FIELDS CLEARED</p>
                  <h2>You found structure<br />inside the fog.</h2>
                  <div className="glyph-row" aria-label="Run summary">{records.map(glyphFor).join(" ")}</div>
                  <div className="final-score">
                    <span>FINAL SIGNAL</span><strong>{formatScore(score)}</strong>
                    {newBest ? <em>NEW BEST</em> : best !== null && <em>BEST {formatScore(best)}</em>}
                  </div>
                  <button className="primary-button" onClick={restart}>PLAY AGAIN</button>
                  <button className="ghost-button" onClick={shareRun}>COPY RESULT</button>
                  <p className="share-status">{shareStatus}</p>
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
                  <small>TURN THE VIEW · ← →</small>
                </label>

                <label>
                  <span className="control-title"><b>DEPTH</b><output>{projection}%</output></span>
                  <span className="range-wrap">
                    <input type="range" min="0" max="100" step="1" value={projection} aria-label="Compress the field depth" onChange={(event) => updateProjection(Number(event.target.value))} />
                    {pulse && <i className="target-notch" style={{ left: `${level.targetProjection}%` }} />}
                  </span>
                  <small>COMPRESS THE FOG · ↑ ↓</small>
                </label>
              </div>

              <div className="clarity-block">
                <div className="clarity-label"><span>FIELD CLARITY</span><strong>{Math.round(clarity)}%</strong></div>
                <div className="clarity-meter"><i style={{ width: `${clarity}%` }} /></div>
                {aligned && !solved ? (
                  <p className="payout-line">
                    LOCK QUALITY {Math.round(precision * 100)}% · A CLEAN PICK PAYS <b>+{pickBonus}</b>
                    {wrongPicks.length > 0 ? ` · NEXT MISS −${wrongCost}` : ""}
                  </p>
                ) : (
                  <p>{clarity > 70 ? "Almost there. Make smaller moves." : "Follow the rows as they begin to agree."}</p>
                )}
              </div>

              {solved ? (
                <button className="primary-button" onClick={nextLevel}>
                  {levelIndex === levels.length - 1 ? "FINISH RUN" : "ENTER NEXT FIELD"}<span>→</span>
                </button>
              ) : (
                <button className="pulse-button" onClick={usePulse} disabled={pulse}>
                  <span className="key-cap">H</span>
                  <span><strong>USE HIDDEN HINT</strong><small>−{HINT_COST} SIGNAL</small></span>
                  <span className="pulse-glyph">⌁</span>
                </button>
              )}
              <p className="hint-copy">A hidden hint makes the search easy—but a little less rewarding.</p>
              <p className="key-legend">KEYS · <b>← →</b> TWIST · <b>↑ ↓</b> DEPTH · <b>SHIFT</b> ×5 · <b>1–8</b> RAY · <b>H</b> HINT · <b>M</b> MUTE</p>
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
