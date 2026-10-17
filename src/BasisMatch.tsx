import { useEffect, useMemo, useRef, useState } from "react";
import type { Sound } from "./sound";
import { makeMatchRounds, matchReason, matchStars, parseMatchBest, parseMatchSeed, sameLattice, visibleMatchPoints, type MatchBasis } from "./match";

const STORE = "lb:match:best:v1";
const LETTERS = ["A", "B", "C"];
function loadBest() { try { return parseMatchBest(localStorage.getItem(STORE)); } catch { return 0; } }
function MapView({ basis, revealed, label }: { basis: MatchBasis; revealed: boolean; label: string }) {
  return <svg className="match-map" viewBox="-140 -140 280 280" role="img" aria-label={`${label}. U equals (${basis.u.join(", ")}); V equals (${basis.v.join(", ")}). ${revealed ? "Generated lattice points are shown." : "Arrows only. Use the reveal lens to see generated points."}`}>
    <path className="match-axis" d="M-125,0H125M0,-125V125" />
    {revealed && <g className="match-dots">{visibleMatchPoints(basis).map(([x,y]) => <circle key={`${x},${y}`} cx={x} cy={-y} r="3" />)}</g>}
    {([basis.u, basis.v]).map(([x,y],index) => {
      const len = Math.hypot(x,y), dx = x / len, dy = -y / len;
      return <g key={index} className={index === 0 ? "match-u" : "match-v"}>
        <line x1="0" y1="0" x2={x} y2={-y} />
        <path d={`M${x},${-y}L${x-dx*10-dy*5},${-y-dy*10+dx*5}L${x-dx*10+dy*5},${-y-dy*10-dx*5}Z`} />
        <text x={x + dx * 14} y={-y + dy * 14 + 4}>{index === 0 ? "U" : "V"}</text>
      </g>;
    })}
    <circle className="match-origin" r="5" />
  </svg>;
}
export default function BasisMatch({ play }: { play: (action: (sound: Sound) => void) => void }) {
  const [seed, setSeed] = useState(() => parseMatchSeed(new URLSearchParams(location.search).get("basis")));
  const rounds = useMemo(() => makeMatchRounds(seed), [seed]);
  const [index, setIndex] = useState(0);
  const [misses, setMisses] = useState<number[]>([]);
  const [lens, setLens] = useState(false);
  const [solved, setSolved] = useState(false);
  const [stars, setStars] = useState<number[]>([]);
  const [message, setMessage] = useState("Find the map that reaches exactly the same dots as the original. Take your time.");
  const [complete, setComplete] = useState(false);
  const [best, setBest] = useState(loadBest);
  const [share, setShare] = useState("");
  const [shareStatus, setShareStatus] = useState("");
  const [storageFailed, setStorageFailed] = useState(false);
  const nextRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const round = rounds[index];
  const total = stars.reduce((sum,n) => sum+n,0);
  useEffect(() => { if (solved) nextRef.current?.focus({ preventScroll:true }); }, [solved]);

  function choose(choice: number) {
    if (solved || complete || misses.includes(choice)) return;
    const matching = sameLattice(round.reference, round.options[choice]);
    if (matching) {
      const earned = matchStars(misses.length, lens);
      setSolved(true);
      setStars([...stars, earned]);
      setMessage(`Map ${LETTERS[choice]} is a match! ${earned} ${earned === 1 ? "star" : "stars"} earned. ${matchReason(round.reference, round.options[choice])}`);
      play(sound => sound.correct(earned === 3));
    } else {
      setMisses([...misses, choice]);
      setMessage(`Map ${LETTERS[choice]} is an impostor. ${matchReason(round.reference, round.options[choice])} Try another map.`);
      play(sound => sound.wrong());
    }
  }
  function clearRound() { setMisses([]); setLens(false); setSolved(false); }
  function next() {
    if (index === rounds.length - 1) {
      setComplete(true);
      const nextBest = Math.max(total, best, loadBest());
      setBest(nextBest);
      try { localStorage.setItem(STORE, String(nextBest)); } catch { setStorageFailed(true); }
      play(sound => sound.finish());
      return;
    }
    setIndex(index + 1); clearRound();
    setMessage("New maps loaded. Which one reaches exactly the same dots?");
    headingRef.current?.focus({ preventScroll:true });
  }
  function replay(remix: boolean) {
    if (remix) {
      const nextSeed = seed % 999999999 + 1;
      setSeed(nextSeed);
    }
    setIndex(0); clearRound(); setStars([]); setComplete(false); setShare(""); setShareStatus("");
    setMessage("Fresh start. Find the matching map; the lens is here if you want it.");
    headingRef.current?.focus({ preventScroll:true });
  }
  async function shareChallenge() {
    const url = new URL(location.href);
    url.search = ""; url.searchParams.set("basis", String(seed)); url.hash = "basis-match";
    const text = `${complete ? `Basis Match: ${total}/18 stars. ` : "Basis Match: "}Can you spot the matching maps? ${url.href}`;
    setShare(text);
    try { await navigator.clipboard.writeText(text); setShareStatus("Challenge copied!"); }
    catch { setShareStatus("Select the text below to copy your challenge."); }
  }

  return <section className="match-section" id="basis-match" aria-labelledby="match-title">
    <header className="flight-heading"><div><p className="eyebrow">SPOT THE IMPOSTOR · SIX ROUNDS · NO TIMER</p><h2 id="match-title">Basis Match</h2><p>Different arrows. Same world? Only one map tells the truth.</p></div><span className="flight-medal-total">BEST {best} / 18 STARS</span></header>
    <div className="match-progress" aria-label={`Round ${index+1} of 6. ${total} stars earned.`}>
      {rounds.map((r,i) => <span key={r.name} className={i === index ? "current" : ""}>{stars[i] ? "★".repeat(stars[i]) : `0${i+1}`}<small>{r.name}</small></span>)}
    </div>
    <div className="match-brief">
      <div className="match-reference"><span>ORIGINAL MAP</span><MapView basis={round.reference} revealed label="Original map" /><p>U ({round.reference.u.join(", ")}) · V ({round.reference.v.join(", ")})</p></div>
      <div><p className="eyebrow">ROUND 0{index+1} / 06</p><h3 ref={headingRef} tabIndex={-1}>{round.name}</h3><p>{round.brief}</p><p>Every dot comes from whole-number steps along the two arrows. You can step backward too. Compare the arrows below, then choose a map.</p>
        <button className="ghost-button match-lens" disabled={lens || solved || complete} onClick={() => { setLens(true); setMessage("Lens open. Compare the dots on each map with the original. A first-pick match still earns two stars."); play(sound => sound.hint()); }}>{lens ? "LENS OPEN · DOTS REVEALED" : "REVEAL LENS · SHOW THE DOTS"}</button>
        <p className="match-scoring">★★★ First pick, no lens. ★★ First pick with lens. ★ Keep exploring until you find it.</p>
      </div>
    </div>
    <div className="match-options">
      {round.options.map((basis,i) => {
        const rejected = misses.includes(i);
        const correct = solved && sameLattice(round.reference, basis);
        return <article className={`match-option ${rejected ? "rejected" : ""} ${correct ? "matched" : ""}`} key={`${seed}-${index}-${i}`}>
          <div className="match-card-label"><h4>MAP {LETTERS[i]}</h4><span>{correct ? "✓ MATCH" : rejected ? "× IMPOSTOR" : "?"}</span></div>
          <MapView basis={basis} revealed={lens || solved || rejected} label={`Map ${LETTERS[i]}`} />
          <p className="match-vector-text">U ({basis.u.join(", ")}) · V ({basis.v.join(", ")})</p>
          <button className="primary-button" disabled={solved || complete || rejected} onClick={() => choose(i)}>CHOOSE MAP {LETTERS[i]}</button>
        </article>;
      })}
    </div>
    <p className={`match-status ${solved ? "match-success" : ""}`} role="status">{message}</p>
    {solved && !complete && <div className="match-payoff"><p><strong>{"★".repeat(stars[index])} DISCOVERY</strong> {round.lesson}</p><button ref={nextRef} className="primary-button" onClick={next}>{index === rounds.length - 1 ? "FINISH EXPEDITION" : "NEXT ROUND →"}</button></div>}
    {complete && <div className="match-finish" role="status"><p className="eyebrow">EXPEDITION COMPLETE</p><h3>{total === 18 ? "Master cartographer!" : total >= 12 ? "Sharp-eyed navigator!" : "Every map decoded!"}</h3><strong>{total} / 18 STARS</strong><p>{total === 18 ? "Six first-pick matches without the lens. Try a remix and see if you can do it again." : "The maps are yours. Replay for more stars, or remix the expedition."}</p></div>}
    <div className="match-actions"><button className="ghost-button" onClick={() => replay(false)}>REPLAY THESE MAPS</button><button className="ghost-button" onClick={() => replay(true)}>REMIX THE MAPS</button><button className="ghost-button" onClick={shareChallenge}>SHARE CHALLENGE</button></div>
    {share && <div className="match-share"><p role="status">{shareStatus}</p><label>Challenge text<textarea readOnly value={share} onFocus={e => e.currentTarget.select()} /></label></div>}
    <details className="game-howto match-math"><summary>What proves a match?</summary><p>A small picture is a clue, not a proof. A match requires that each basis can rebuild the other with whole-number steps. That guarantees the same infinite set of dots. Our check uses exact integer arithmetic for these small coordinates, including the equal-area impostors. This game teaches changes of basis; it does not break a cryptographic key.</p></details>
    <p className="flight-save-note">{storageFailed ? "Storage is unavailable; your best score stays for this visit only." : "Best score saves in this browser. Shared links contain the map seed only, never your saved scores."} All rounds use the same drawing scale. Touch or keyboard: Tab to a choice, then Enter or Space.</p>
  </section>;
}
