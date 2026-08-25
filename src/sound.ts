export type Sound = {
  setMuted(muted: boolean): void;
  tick(clarity: number): void;
  lock(): void;
  correct(perfect: boolean): void;
  wrong(): void;
  hint(): void;
  finish(): void;
  dispose(): void;
};

type Voice = {
  freq: number;
  duration: number;
  sweepTo?: number;
  type?: OscillatorType;
  gain?: number;
  delay?: number;
  attack?: number;
  lowpass?: number;
};

type LegacyWindow = Window & { webkitAudioContext?: typeof AudioContext };

const MASTER_GAIN = 0.9;
const SILENCE = 0.0001;
const TICK_INTERVAL = 0.055;

export function createSound(): Sound {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let muted = false;
  let unavailable = false;
  let lastTick = Number.NEGATIVE_INFINITY;

  function ensure(): AudioContext | null {
    if (muted || unavailable) return null;
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as LegacyWindow).webkitAudioContext;
      if (!Ctor) {
        unavailable = true;
        return null;
      }
      try {
        const created = new Ctor();
        const gain = created.createGain();
        gain.gain.value = MASTER_GAIN;
        gain.connect(created.destination);
        ctx = created;
        master = gain;
      } catch {
        unavailable = true;
        ctx = null;
        master = null;
        return null;
      }
    }
    if (ctx.state === "suspended") {
      try {
        ctx.resume().catch(() => undefined);
      } catch {
        // a browser that refuses to resume simply stays quiet
      }
    }
    return ctx;
  }

  function play(voice: Voice) {
    const audio = ensure();
    if (!audio || !master) return;
    try {
      const start = audio.currentTime + (voice.delay ?? 0);
      const end = start + voice.duration;
      const peak = voice.gain ?? 0.04;
      const attack = Math.min(voice.attack ?? 0.012, voice.duration * 0.4);

      const osc = audio.createOscillator();
      osc.type = voice.type ?? "sine";
      osc.frequency.setValueAtTime(voice.freq, start);
      if (voice.sweepTo !== undefined) {
        osc.frequency.linearRampToValueAtTime(voice.sweepTo, end);
      }

      const gain = audio.createGain();
      gain.gain.setValueAtTime(SILENCE, start);
      gain.gain.exponentialRampToValueAtTime(peak, start + attack);
      gain.gain.exponentialRampToValueAtTime(SILENCE, end);

      let filter: BiquadFilterNode | null = null;
      if (voice.lowpass !== undefined) {
        filter = audio.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(voice.lowpass, start);
        osc.connect(filter);
        filter.connect(gain);
      } else {
        osc.connect(gain);
      }
      gain.connect(master);

      osc.onended = () => {
        osc.disconnect();
        filter?.disconnect();
        gain.disconnect();
      };
      osc.start(start);
      osc.stop(end + 0.02);
    } catch {
      // never let a dead audio graph reach the game loop
    }
  }

  function setMuted(next: boolean) {
    muted = next;
    if (master) {
      master.gain.value = next ? 0 : MASTER_GAIN;
    }
  }

  function tick(clarity: number) {
    const audio = ensure();
    if (!audio) return;
    const now = audio.currentTime;
    if (now - lastTick < TICK_INTERVAL) return;
    lastTick = now;
    const warmth = Math.max(0, Math.min(100, clarity)) / 100;
    play({
      freq: 220 * Math.pow(3, warmth),
      duration: 0.035,
      type: "triangle",
      gain: 0.015,
      attack: 0.006,
    });
  }

  function lock() {
    const chord = [
      { freq: 523.25, gain: 0.05, delay: 0 },
      { freq: 659.25, gain: 0.042, delay: 0.035 },
      { freq: 783.99, gain: 0.036, delay: 0.07 },
    ];
    for (const note of chord) {
      play({
        freq: note.freq,
        duration: 0.5,
        type: "sine",
        gain: note.gain,
        delay: note.delay,
        attack: 0.06,
      });
    }
  }

  function correct(perfect: boolean) {
    const notes = perfect
      ? [440, 554.37, 659.25, 880, 1108.73]
      : [440, 554.37, 659.25, 880];
    const peak = perfect ? 0.055 : 0.04;
    notes.forEach((freq, index) => {
      const last = index === notes.length - 1;
      play({
        freq,
        duration: last ? 0.3 : 0.18,
        type: "sine",
        gain: peak,
        delay: index * 0.07,
        attack: 0.014,
      });
    });
  }

  function wrong() {
    play({
      freq: 130,
      sweepTo: 90,
      duration: 0.22,
      type: "sawtooth",
      gain: 0.05,
      attack: 0.02,
      lowpass: 520,
    });
  }

  function hint() {
    play({
      freq: 900,
      sweepTo: 1500,
      duration: 0.3,
      type: "triangle",
      gain: 0.025,
      attack: 0.05,
    });
  }

  function finish() {
    const notes = [523.25, 659.25, 783.99, 987.77, 1174.66, 1046.5];
    notes.forEach((freq, index) => {
      const last = index === notes.length - 1;
      play({
        freq,
        duration: last ? 0.9 : 0.22,
        type: "sine",
        gain: last ? 0.05 : 0.04,
        delay: last ? 0.52 : index * 0.1,
        attack: last ? 0.05 : 0.016,
      });
    });
    play({
      freq: 261.63,
      duration: 1.1,
      type: "sine",
      gain: 0.022,
      delay: 0.52,
      attack: 0.08,
    });
  }

  function dispose() {
    if (ctx) {
      try {
        ctx.close().catch(() => undefined);
      } catch {
        // already closed or closing
      }
    }
    ctx = null;
    master = null;
    lastTick = Number.NEGATIVE_INFINITY;
  }

  return { setMuted, tick, lock, correct, wrong, hint, finish, dispose };
}
