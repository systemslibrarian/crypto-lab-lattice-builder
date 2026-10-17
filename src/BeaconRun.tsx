import { useEffect, useMemo, useRef, useState } from 'react';
import { ACTIONS, LABELS, STORE, advance, basis, canLand, chart, coordinates, initial, landing, readProgress, route, same, won, type Action, type Point } from './beacon';
import { createSound, type Sound } from './sound';
import './beacon.css';

const xy = (p: Point): Point => [330 + 44 * p[0], 220 - 42 * p[1]];
const pair = (p: Point) => `(${p[0]}, ${p[1]})`;
const count = (mask: number) => [1, 2, 4].filter(bit => mask & bit).length;
function load() { try { return readProgress(localStorage.getItem(STORE)); } catch { return readProgress(null); } }
export default function BeaconRun() {
  const [index, setIndex] = useState(0);
  const c = useMemo(() => chart(index), [index]);
  const [history, setHistory] = useState(() => [initial(chart(0))]);
  const s = history[history.length - 1];
  const [progress, setProgress] = useState(load);
  const [storageFailed, setStorageFailed] = useState(false);
  const [message, setMessage] = useState('Try + B. Its diagonal jump lands on your first beacon.');
  const [hint, setHint] = useState<Action | null>(null);
  const [started, setStarted] = useState(false);
  const [hover, setHover] = useState<Action | null>(null);
  const sound = useRef<Sound | null>(null);
  const board = useRef<HTMLElement>(null);
  const result = useRef<HTMLDivElement>(null);
  const finished = won(c, s);
  const par = useMemo(() => route(c, initial(c))!.length, [c]);
  const commands = s.jumps + s.refits;
  const [a, b] = basis(s.shear);
  const coord = coordinates(s.position, s.shear);
  const points: Point[] = [];
  for (let x = -6; x <= 6; x += 2) for (let y = -4; y <= 4; y += 2) points.push([x, y]);

  useEffect(() => () => { sound.current?.dispose(); sound.current = null; }, []);
  useEffect(() => {
    if (!finished) return;
    const best = [...progress.best]; best[index] = Math.min(best[index] ?? Infinity, commands);
    save({ ...progress, best });
    result.current?.focus({ preventScroll: true });
    result.current?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  }, [finished]);
  function save(next: typeof progress) {
    setProgress(next);
    try { localStorage.setItem(STORE, JSON.stringify(next)); } catch { setStorageFailed(true); }
  }
  function play(kind: 'tick' | 'lock' | 'correct' | 'finish') {
    if (!progress.sound) return;
    if (!sound.current) sound.current = createSound();
    if (kind === 'tick') sound.current.tick(70);
    else if (kind === 'correct') sound.current.correct(false);
    else sound.current[kind]();
  }
  function move(action: Action) {
    const next = advance(c, s, action);
    if (next === s) {
      if (!finished) setMessage(action === 'trim' || action === 'extend' ? 'That is the refit limit for this board. Try the other direction.' : 'No landing there. Jump onto a dot inside the board without an asteroid. Nothing lost.');
      return;
    }
    setHistory([...history, next]); setHint(null); setHover(null);
    if (action === 'trim' || action === 'extend') {
      setMessage(`B is now ${pair(basis(next.shear)[1])}. Your ship and every dot stayed put. The arrow changed; the lattice did not.`); play('lock');
    } else if (won(c, next)) { setMessage('All three beacons rescued. Docking complete!'); play('finish'); }
    else if (next.collected !== s.collected) { setMessage(`${count(next.collected)} / 3 beacons lit. ${next.collected === 7 ? 'The exit is open — dock at the ring.' : 'Choose your next beacon. Any order works.'}`); play('correct'); }
    else { setMessage(`Landed at ${pair(next.position)}. ${same(next.position, c.dock) ? 'The exit needs all three beacons first.' : 'Hover or focus a jump to preview its landing.'}`); play('tick'); }
  }
  function enter(next: number) {
    const n = next % 6;
    setIndex(n); setHistory([initial(chart(n))]); setHint(null); setHover(null);
    setMessage(n === 0 ? 'Try + B. Its diagonal jump lands on your first beacon.' : 'Pick any beacon. Preview a jump, or refit B to reshape your route.');
    board.current?.focus({ preventScroll: true });
  }
  function start() {
    setStarted(true); board.current?.scrollIntoView({ block: 'start', behavior: 'auto' }); board.current?.focus({ preventScroll: true });
  }
  const aim = hover ?? hint;
  const preview = aim && !['trim', 'extend'].includes(aim) ? landing(s, aim) : null;
  const ship = xy(s.position);
  return <main className="br-shell">
    <nav className="br-nav" aria-label="Main navigation"><a href="https://crypto-lab.systemslibrarian.dev/games/">← All games</a><span>LATTICE / BUILDER</span><button aria-pressed={progress.sound} onClick={() => { save({ ...progress, sound: !progress.sound }); sound.current?.setMuted(progress.sound); }}>Sound {progress.sound ? 'on' : 'off'}</button></nav>
    <header className="br-intro"><div><p className="br-kicker">VECTOR FLIGHT / BEACON RUN</p><h1>Two arrows.<br /><em>Your way out.</em></h1><p>Light three beacons. Dodge bad landing spots. Then dock at the exit. Your jumps are the puzzle — change an arrow to open a better route.</p><button className="br-primary" onClick={start}>{started ? 'Back to the flight' : 'Play Beacon Run'} <span aria-hidden="true">↗</span></button></div><aside><span className="br-mini-map" aria-hidden="true">A + B</span><p className="br-kicker">WHAT YOU’LL FIGURE OUT</p><p>How two arrows generate a lattice — and how changing those arrows can make the <strong>same map</strong> easier to navigate.</p><small>No lives. Free undo &amp; hints. Aim for a tighter route each time.</small></aside></header>
    <section className="br-game" ref={board} tabIndex={-1} id="beacon-run" aria-label="Beacon Run flight controls" data-chart={index} data-position={s.position.join(',')} data-shear={s.shear} data-collected={s.collected} data-phase={finished ? 'done' : 'playing'} onKeyDown={event => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
      const action: Record<string, Action> = { d: 'a+', a: 'a-', w: 'b+', s: 'b-', q: 'trim', e: 'extend' };
      if (action[event.key.toLowerCase()]) { event.preventDefault(); move(action[event.key.toLowerCase()]); }
    }}>
      <div className="br-game-head"><div><p className="br-kicker">CHART {index + 1} / 6</p><h2>{c.name}</h2></div><div className="br-hud"><span>BEACONS <b>{count(s.collected)} / 3</b></span><span>COMMANDS <b>{commands}</b></span><span>ROUTE TARGET <b>{par}</b></span></div></div>
      <div className="br-play-layout"><div className="br-map-wrap"><svg className="br-map" viewBox="0 0 660 440" role="img" aria-label={`Ship at ${pair(s.position)}. Beacons: ${c.beacons.map((p, i) => `${i + 1} at ${pair(p)} ${s.collected & (1 << i) ? 'lit' : 'unlit'}`).join('; ')}. Exit at ${pair(c.dock)}. Asteroids at ${c.rocks.map(pair).join(', ')}. A ${pair(a)}, B ${pair(b)}.`}>
        <defs><pattern id="br-stars" width="31" height="31" patternUnits="userSpaceOnUse"><circle cx="7" cy="11" r=".7" fill="#40506d" /></pattern><marker id="br-arrow-a" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="#69e8d1" /></marker><marker id="br-arrow-b" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="#bfadff" /></marker></defs>
        <rect width="660" height="440" fill="url(#br-stars)" />
        <g className="br-grid">{points.map(p => { const [x, y] = xy(p); return <g key={p.join(',')}>{p[0] < 6 && <line x1={x} y1={y} x2={x + 88} y2={y} />}{p[1] < 4 && <line x1={x} y1={y} x2={x} y2={y - 84} />}<circle data-point={p.join(',')} cx={x} cy={y} r="3.5" /></g>; })}</g>
        <polyline className="br-trail" points={history.slice(-120).map(f => xy(f.position).join(',')).join(' ')} />
        {c.rocks.map(p => { const [x, y] = xy(p); return <g className="br-rock" key={p.join(',')} transform={`translate(${x} ${y})`}><path d="M-13,-7 -3,-15 12,-9 16,3 5,14 -10,10 -16,1Z" /><path d="M-5,-5 5,5 M5,-5 -5,5" /></g>; })}
        {c.beacons.map((p, i) => { const [x, y] = xy(p); const lit = !!(s.collected & (1 << i)); return <g className={`br-beacon ${lit ? 'lit' : ''}`} key={i} transform={`translate(${x} ${y})`}><circle className="br-halo" r="23" /><path d="M0,-17 14,-8 14,8 0,17 -14,8 -14,-8Z" /><text y="5">{lit ? '✓' : i + 1}</text></g>; })}
        <g className={`br-dock ${s.collected === 7 ? 'open' : ''}`} transform={`translate(${xy(c.dock).join(' ')})`}><circle r="21" /><circle r="15" /><text y="37">EXIT</text></g>
        {preview && Math.abs(preview[0]) <= 6 && Math.abs(preview[1]) <= 4 && <g className={canLand(c, preview) ? 'br-preview' : 'br-preview blocked'}><line x1={ship[0]} y1={ship[1]} x2={xy(preview)[0]} y2={xy(preview)[1]} /><circle cx={xy(preview)[0]} cy={xy(preview)[1]} r="23" /></g>}
        <g className="br-ship" style={{ transform: `translate(${ship[0]}px, ${ship[1]}px)` }}><circle r="25" /><path d="M0,-17 12,12 0,7 -12,12Z" /></g>
        <text className="br-map-caption" x="24" y="425">ASTEROIDS BLOCK LANDING ONLY · JUMP OVER THEM</text>
      </svg><div className="br-status" role="status">{message}</div></div>
      <div className="br-controls"><div className="br-control-title"><h3>Choose your jump</h3><span>{pair(s.position)}</span></div><div className="br-thrusts" role="group" aria-label="Jump controls">{ACTIONS.slice(0, 4).map(action => {
        const delta = action[0] === 'a' ? a : b; const sign = action.endsWith('+') ? 1 : -1;
        const angle = Math.atan2(-delta[1] * sign, delta[0] * sign) * 180 / Math.PI;
        return <button className={`${action[0] === 'a' ? 'br-a' : 'br-b'} ${hint === action ? 'hinted' : ''}`} key={action} disabled={finished} aria-label={`Jump ${LABELS[action]}`} onMouseEnter={() => setHover(action)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(action)} onBlur={() => setHover(null)} onClick={() => move(action)}><span className="br-direction" style={{ transform: `rotate(${angle}deg)` }} aria-hidden="true">→</span><b>{LABELS[action]}</b><small>{pair([delta[0] * sign, delta[1] * sign])}</small></button>;
      })}</div>
      <div className="br-refit"><div><h3>Reshape arrow B</h3><span>1 refit = 1 command</span></div><svg viewBox="0 0 250 100" role="img" aria-label={`Basis A ${pair(a)} and B ${pair(b)}`}><line x1="80" y1="78" x2="132" y2="78" stroke="#69e8d1" strokeWidth="3" markerEnd="url(#br-arrow-a)" /><line x1="80" y1="78" x2={80 + 26 * b[0]} y2="26" stroke="#bfadff" strokeWidth="3" markerEnd="url(#br-arrow-b)" /><text x="144" y="84" fill="#69e8d1">A</text><text x={80 + 26 * b[0]} y="17" fill="#bfadff">B</text><circle cx="80" cy="78" r="4" fill="white" /></svg><div className="br-refit-buttons">{(['trim', 'extend'] as Action[]).map(action => <button className={hint === action ? 'hinted' : ''} key={action} disabled={finished || (action === 'trim' ? s.shear === -1 : s.shear === 2)} onClick={() => move(action)}>{LABELS[action]}</button>)}</div><p>Subtract A to turn B left. Add A to turn it right. <strong>The dots stay put.</strong></p></div>
      <div className="br-tools"><button disabled={history.length === 1} onClick={() => { setHistory(history.slice(0, -1)); setHint(null); setHover(null); setMessage('Last command undone, including its beacon or arrow change. Try another route.'); }}>Undo</button><button disabled={finished} onClick={() => { const action = route(c, s)?.[0]; if (action) { setHint(action); setHover(null); setMessage(`Try ${LABELS[action]} ${action === 'trim' || action === 'extend' ? 'in Reshape arrow B' : 'in the jump controls'}. Hints are free — your route target stays the same.`); } }}>Hint</button><button onClick={() => enter(index)}>Retry</button></div><p className="br-keyboard">Keyboard here: D/A = ±A · W/S = ±B<br />Q/E = refit B. Jump and refit each count once.</p></div></div>
      {finished && <div className="br-result" ref={result} tabIndex={-1}><p className="br-kicker">{commands === par ? 'SHORTEST ROUTE FOUND' : 'BEACONS RESCUED'}</p><h2>{commands === par ? 'That route was sharp.' : 'You brought them home.'}</h2><p>{s.jumps} jumps + {s.refits} refits = {commands} commands. {commands === par ? 'You matched the route target. Hints never reduce your reward.' : `Can you shave off ${commands - par} on a replay? Undo is still available.`}</p><div className="br-lesson" role="note" aria-label="What you just learned"><strong>What you just learned</strong><p>Your jumps added or subtracted whole basis vectors. That kept every landing on the lattice. {s.refits ? 'Refitting B changed the available jumps without moving a single lattice point: B′ = B − A can be reversed with B = B′ + A.' : 'You used the original arrows all the way. Try refitting B on a replay: B − A changes the jump while preserving the same lattice.'}</p><p>In cryptography, changing a lattice basis can help reveal short vectors. ML-KEM uses a much harder problem with high-dimensional noisy modular equations. This little route puzzle teaches the geometry, not how to break encryption.</p></div><div className="br-result-actions"><button className="br-primary" onClick={() => { enter((index + 1) % 6); start(); }}>Next chart ↗</button><button onClick={() => { enter(index); start(); }}>Beat this route</button></div></div>}
    </section>
    <section className="br-under" aria-label="Flight details"><div><h2>Same dots. Different moves.</h2><p>Your position in the current basis: <strong>{coord[0]} A + ({coord[1]}) B = {pair(s.position)}</strong>. Refitting changes these coordinates, not your position.</p><details><summary>Why does the refit preserve the lattice?</summary><p>Replace B with B′ = B − A. Any old point mA + nB becomes (m + n)A + nB′. Both coefficients are still integers, and the operation reverses by adding A. The same reasoning works for B + A. The finite board and asteroids restrict play; they do not define the infinite lattice.</p><p>The route target is computed for this chart, with jumps and refits each counting as one command. It measures a finite navigation problem, not a shortest lattice vector or a security level.</p><p><a href="https://csrc.nist.gov/pubs/fips/203/final">ML-KEM’s actual foundation: NIST FIPS 203</a></p></details></div><div><h2>Your next route</h2><label htmlFor="br-chart">Choose a chart</label><select id="br-chart" value={index} onChange={event => enter(Number(event.target.value))}>{Array.from({ length: 6 }, (_, i) => <option key={i} value={i}>{i + 1}. {chart(i).name}</option>)}</select><p>Best on this chart: <strong>{progress.best[index] ?? '—'}</strong> commands.</p><small>{storageFailed ? 'Storage is unavailable. Results stay for this visit.' : 'Best routes and sound preference save only in this browser.'}</small><button className="br-clear" onClick={() => { save(readProgress(null)); sound.current?.setMuted(true); setMessage('Saved routes cleared. Your current flight is unchanged.'); }}>Clear saved routes &amp; sound</button></div></section>
    <footer className="br-footer"><span>LATTICE BUILDER · LEARN THROUGH PLAY</span><a href="?mode=classic#vector-flight">Original games &amp; deeper maths →</a><a href="https://github.com/systemslibrarian/crypto-lab-lattice-builder">Source</a></footer>
  </main>;
}
