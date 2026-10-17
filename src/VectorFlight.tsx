import { useEffect, useRef, useState } from "react";
import type { Vector } from "./lattice";
import type { Sound } from "./sound";
import { FLIGHT_MISSIONS, FLIGHT_LIMIT, THRUSTERS, MEDALS, canLand, flightRoute, flightPar, flightMedal, moveFlight, newFlight, readFlightMedals, samePoint } from "./flight";

const STORE = "lb:flight:medals:v1";
function loadMedals() {
  try { return readFlightMedals(localStorage.getItem(STORE)); } catch { return {}; }
}
export default function VectorFlight({ play }: { play: (action: (sound: Sound) => void) => void }) {
  const [missionIndex, setMissionIndex] = useState(0);
  const [state, setState] = useState(newFlight);
  const [medals, setMedals] = useState(loadMedals);
  const [message, setMessage] = useState("Ready, pilot. Tap + U twice to reach your first beacon.");
  const [hint, setHint] = useState<Vector | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [storageFailed, setStorageFailed] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);
  const mission = FLIGHT_MISSIONS[missionIndex];
  const current = state.history[state.history.length - 1];
  const moves = state.history.length - 1;
  const complete = current.collected === mission.beacons.length;
  const par = flightPar(mission);
  const medal = complete ? flightMedal(moves, par, state.hinted) : 0;
  const target = mission.beacons[current.collected];
  const scale = Math.min(250 / (FLIGHT_LIMIT * (Math.abs(mission.u[0]) + Math.abs(mission.v[0]))), 180 / (FLIGHT_LIMIT * (Math.abs(mission.u[1]) + Math.abs(mission.v[1]))));
  const project = (p: Vector): Vector => [300 + scale * (p[0] * mission.u[0] + p[1] * mission.v[0]), 225 - scale * (p[0] * mission.u[1] + p[1] * mission.v[1])];
  const ship = project(current.position);
  const points: Vector[] = [];
  for (let i = -FLIGHT_LIMIT; i <= FLIGHT_LIMIT; i++) for (let j = -FLIGHT_LIMIT; j <= FLIGHT_LIMIT; j++) points.push([i, j]);

  useEffect(() => {
    if (!complete) return;
    const next = { ...loadMedals(), ...medals, [mission.id]: Math.max(medals[mission.id] ?? 0, medal) };
    setMedals(next);
    try { localStorage.setItem(STORE, JSON.stringify(next)); } catch { setStorageFailed(true); }
    resultRef.current?.focus({ preventScroll: true });
  }, [complete]);

  function move(delta: Vector) {
    const next = moveFlight(mission, state, delta);
    if (next === state) return;
    const landed = next.history[next.history.length - 1];
    setState(next);
    setHint(null);
    if (landed.collected > current.collected) {
      const done = landed.collected === mission.beacons.length;
      play(sound => done ? sound.finish() : sound.correct(false));
      setMessage(done ? "All beacons online. Mission complete!" : `Beacon ${landed.collected} online! Next stop: beacon ${landed.collected + 1}.`);
    } else {
      play(sound => sound.tick(50));
      setMessage(`Position ${landed.position[0]} U, ${landed.position[1]} V. Next: beacon ${landed.collected + 1}.`);
    }
  }
  function enter(index: number) {
    setMissionIndex(index);
    setState(newFlight());
    setHint(null);
    setMessage(index === 0 ? "Ready, pilot. Tap + U twice to reach your first beacon." : "Thrusters ready. Reconnect the numbered beacons in order.");
  }
  function showHint() {
    if (!target) return;
    const route = flightRoute(mission, current.position, target);
    if (!route || route.length < 2) return;
    const delta: Vector = [route[1][0] - current.position[0], route[1][1] - current.position[1]];
    const thruster = THRUSTERS.find(t => samePoint(t.delta, delta))!;
    setHint(route[1]);
    setState({ ...state, hinted: true });
    setMessage(`Try ${thruster.label}. That is one step along a shortest route to beacon ${current.collected + 1}. Silver is still within reach.`);
    play(sound => sound.hint());
  }

  return <section className="flight-section" id="vector-flight" aria-labelledby="flight-title" onKeyDown={event => {
    if (event.ctrlKey || event.altKey || event.metaKey || event.repeat) return;
    const thrust = THRUSTERS.find(t => t.key === event.key.toLowerCase());
    if (thrust) { event.preventDefault(); move(thrust.delta); }
  }}>
    <header className="flight-heading">
      <div><p className="eyebrow">A NEW WAY TO PLAY · SIX MISSIONS · NO TIMER</p><h2 id="flight-title">Vector Flight</h2><p>Two thrusters. A sky full of beacons. Find your way home.</p></div>
      <span className="flight-medal-total">{Object.values(medals).filter(n => n === 3).length} / {FLIGHT_MISSIONS.length} GOLD MEDALS</span>
    </header>
    <nav className="flight-missions" aria-label="Flight missions">
      {FLIGHT_MISSIONS.map((item, index) => <button key={item.id} aria-pressed={index === missionIndex} onClick={() => enter(index)}>
        <span>0{index + 1}</span><strong>{item.name}</strong><small>{MEDALS[medals[item.id] ?? 0]}</small>
      </button>)}
    </nav>
    <div className="flight-layout">
      <div className={`flight-field ${complete ? "flight-won" : ""}`}>
        <div className="flight-hud"><span>BEACONS <b>{current.collected} / {mission.beacons.length}</b></span><span>MOVES <b>{moves}</b></span><span>BEST ROUTE <b>{par}</b></span></div>
        <svg viewBox="0 0 600 460" role="img" aria-label={`Flight board. Ship at ${current.position[0]} U, ${current.position[1]} V. ${complete ? "All beacons connected." : `Next beacon at ${target[0]} U, ${target[1]} V.`} Debris blocks landing points marked with crosses.`}>
          <g className="flight-grid">{points.map(p => {
            const [x, y] = project(p);
            return <g key={p.join(",")}>
              {THRUSTERS.filter(t => t.delta[0] + t.delta[1] === 1).map(t => {
                const neighbor: Vector = [p[0] + t.delta[0], p[1] + t.delta[1]];
                const [nx, ny] = project(neighbor);
                return neighbor.every(n => n <= FLIGHT_LIMIT) ? <line key={t.key} x1={x} y1={y} x2={nx} y2={ny} /> : null;
              })}<circle cx={x} cy={y} r="2.5" />
            </g>;
          })}</g>
          <polyline className="flight-trail" points={state.history.slice(-100).map(s => project(s.position).join(",")).join(" ")} />
          {mission.rocks.map(p => { const [x, y] = project(p); return <g className="flight-rock" key={p.join(",")}><rect x={x - 9} y={y - 9} width="18" height="18" rx="3" /><path d={`M${x-4},${y-4}l8,8m0,-8l-8,8`} /></g>; })}
          <text className="flight-home" x="300" y="248">HOME</text>
          {mission.beacons.map((p, index) => {
            const [x, y] = project(p);
            return <g className={`flight-beacon ${index < current.collected ? "connected" : index === current.collected ? "next" : ""}`} key={index}>
              <circle cx={x} cy={y} r="15" /><text x={x} y={y + 4}>{index < current.collected ? "✓" : index + 1}</text>
              {index === current.collected && <circle className="beacon-halo" cx={x} cy={y} r="23" />}
            </g>;
          })}
          {hint && <circle className="flight-hint-dot" cx={project(hint)[0]} cy={project(hint)[1]} r="20" />}
          <g className="flight-ship" style={{ transform: `translate(${ship[0]}px, ${ship[1]}px)` }}><circle r="13" /><path d="M0,-9 L7,7 L0,4 L-7,7 Z" /></g>
        </svg>
        <p className="flight-status" role="status">{message}</p>
      </div>
      <div className="flight-controls">
        <p className="eyebrow">MISSION 0{missionIndex + 1}</p><h3>{mission.name}</h3><p>{mission.brief}</p>
        <div className="flight-coordinate"><span>YOUR POSITION</span><strong>{current.position[0]} U + ({current.position[1]}) V</strong><span>{complete ? "ALL BEACONS CONNECTED" : `NEXT BEACON: ${target[0]} U + (${target[1]}) V`}</span></div>
        <div className="thruster-grid" role="group" aria-label="Ship thrusters">
          {THRUSTERS.map(t => {
            const landing: Vector = [current.position[0] + t.delta[0], current.position[1] + t.delta[1]];
            const blocked = !canLand(mission, landing);
            const [x, y] = project(t.delta);
            const angle = Math.atan2(y - 225, x - 300) * 180 / Math.PI;
            return <button key={t.key} aria-label={`Thrust ${t.label}${blocked ? " — blocked" : ""}`} disabled={complete || blocked} onClick={() => move(t.delta)}>
              <span aria-hidden="true" className="thrust-arrow" style={{ transform: `rotate(${angle}deg)` }}>→</span><b>{t.label}</b><kbd>{t.key.toUpperCase()}</kbd>
            </button>;
          })}
        </div>
        <div className="flight-tools">
          <button disabled={moves === 0 || complete} onClick={() => { setState({ ...state, history: state.history.slice(0, -1) }); setHint(null); setMessage("Last move undone. Try another route."); }}>UNDO</button>
          <button disabled={complete} onClick={showHint}>HINT</button>
          <button onClick={() => enter(missionIndex)}>RETRY</button>
        </div>
        <p className="flight-rules">Gold: {par} moves, no hints. Silver: at most {par + 4} moves. Bronze: get everyone home. Undo is free. No lives to lose.</p>
        {complete && <div className="flight-result" ref={resultRef} tabIndex={-1}>
          <span aria-hidden="true">✦</span><h3>{MEDALS[medal]} flight!</h3><p>{moves === par ? "You found a shortest route through every beacon." : `${moves - par} extra moves. Try a tighter route for your next medal.`}</p>
          <p className="round-lesson"><strong>What you just learned</strong>{mission.lesson}</p>
          <button className="primary-button" onClick={() => enter((missionIndex + 1) % FLIGHT_MISSIONS.length)}>{missionIndex < FLIGHT_MISSIONS.length - 1 ? "NEXT MISSION →" : "FLY AGAIN →"}</button>
        </div>}
        <button className="flight-explain" aria-expanded={showHelp} onClick={() => setShowHelp(!showHelp)}>Why does this work? {showHelp ? "−" : "+"}</button>
        {showHelp && <p className="flight-explanation">Each dot is a whole-number combination aU + bV. A positive thrust adds a basis vector; a negative thrust subtracts it. Slanted vectors can cancel part of each other. Your medal measures the number of thruster taps on this board, not Euclidean distance or cryptographic skill. This is a navigation puzzle, not an ML-KEM attack.</p>}
      </div>
    </div>
    <p className="flight-save-note">{storageFailed ? "Storage is unavailable. Medals stay for this visit only." : "Medals save in this browser. No account, no leaderboard, just your next best flight."} Keyboard: focus a flight control, then W / S for ±U and D / A for ±V.</p>
  </section>;
}
