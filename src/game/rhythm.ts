// Live rhythm mini-game — pure logic (no DOM). The on-screen player lives in
// src/ui/rhythm.ts. MVP: a short real-time "performance" where the RIGHT hand
// taps falling notes (2 lanes) and the LEFT hand fires staging commands during
// "chance" windows. The score converts into the live's satisfaction bonus
// (buffs.liveSat), so it slots into the existing resolveLive math unchanged.

import type { GameState, LiveDecision, Segment } from "./types";

export interface RhythmNote {
  t: number; // ms from performance start when the note reaches the hit line
  lane: 0 | 1; // which of the two right-hand lanes
}
export interface StagingCue {
  t: number; // ms from start when the chance window opens
  windowMs: number; // how long the window stays open
  target: Segment; // the crowd to play to in this window (resolved vs decision.target)
}
export interface Beatmap {
  durationMs: number;
  bpm: number;
  notes: RhythmNote[];
  cues: StagingCue[];
}

export interface RhythmResult {
  notesTotal: number;
  perfect: number;
  good: number;
  miss: number;
  maxCombo: number;
  accuracy: number; // 0..1 (perfect = 1, good = 0.5)
  stagingTotal: number;
  stagingHits: number;
}

// --- tuning ----------------------------------------------------------------
export const RK = {
  bpm: 150, // performance tempo (metal-ish)
  leadMs: 1600, // how long a note is visible before the hit line
  perfectMs: 55, // |dt| for a Perfect
  goodMs: 130, // |dt| for a Good (else Miss)
  stagingWindowMs: 1300, // chance-window length
  // satisfaction mapping (banked into buffs.liveSat; menu path averages ~18–20,
  // so decent play here lands in the same band to keep difficulty parity).
  satFromAccuracy: 18,
  satFromStaging: 9,
};

// Staging commands: two styles, each resonant with one axis of crowds.
export type StagingStyle = "hype" | "show";
export const STAGING_FOR: Record<Segment, StagingStyle> = {
  core: "hype",
  light: "hype",
  visual: "show",
  expert: "show",
};

/** Small deterministic RNG (mulberry32) so a beatmap is reproducible per seed. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Build a procedural 2-lane chart on a steady tempo. Harder venues get denser
 *  notes (more eighth-note fills) and one extra staging cue. */
export function generateBeatmap(seed: number, decision: LiveDecision): Beatmap {
  const r = rng(seed);
  const bpm = RK.bpm;
  const beatMs = 60000 / bpm;
  const dense = decision.cap >= 600; // bigger stage = busier chart
  const bars = dense ? 10 : 8; // 4 beats/bar
  const durationMs = Math.round((bars + 1) * 4 * beatMs); // +1 bar of outro room
  const notes: RhythmNote[] = [];
  let lastLane = 0;
  // Place notes on each beat; sprinkle off-beat eighths (denser on big stages).
  for (let b = 0; b < bars * 4; b++) {
    const t = Math.round((b + 2) * beatMs); // start after a 2-beat count-in
    const lane: 0 | 1 = r() < 0.5 ? 0 : 1;
    notes.push({ t, lane });
    lastLane = lane;
    const offChance = dense ? 0.5 : 0.3;
    if (b % 1 === 0 && r() < offChance) {
      notes.push({ t: Math.round(t + beatMs / 2), lane: (lastLane ^ 1) as 0 | 1 });
    }
  }
  // Staging cues spread across the middle of the song.
  const cueCount = dense ? 4 : 3;
  const cues: StagingCue[] = [];
  const crowds: Segment[] = ["core", "light", "visual", "expert"];
  for (let i = 0; i < cueCount; i++) {
    const frac = (i + 1) / (cueCount + 1);
    const t = Math.round(durationMs * frac);
    // Mostly the night's target crowd, occasionally a different one (keeps the
    // left hand honest instead of mashing one button).
    const target = r() < 0.7 ? decision.target : crowds[Math.floor(r() * 4)];
    cues.push({ t, windowMs: RK.stagingWindowMs, target });
  }
  return { durationMs, bpm, notes, cues };
}

/** Convert a finished performance into a satisfaction bonus (buffs.liveSat). */
export function rhythmToLiveSat(res: RhythmResult): number {
  const stagingRatio = res.stagingTotal ? res.stagingHits / res.stagingTotal : 0;
  return Math.round(res.accuracy * RK.satFromAccuracy + stagingRatio * RK.satFromStaging);
}

/** Letter grade for the performance (display only). */
export function rhythmGrade(res: RhythmResult): string {
  const stagingRatio = res.stagingTotal ? res.stagingHits / res.stagingTotal : 0;
  const score = res.accuracy * 0.7 + stagingRatio * 0.3;
  if (res.notesTotal > 0 && res.miss === 0 && res.accuracy > 0.97) return "SS";
  if (score >= 0.9) return "S";
  if (score >= 0.78) return "A";
  if (score >= 0.62) return "B";
  if (score >= 0.45) return "C";
  return "D";
}

/** Apply the performance to state: bank the satisfaction bonus, and reward a
 *  great show with a little affection/fame (mirrors what the menu path gave). */
export function applyRhythmResult(state: GameState, res: RhythmResult): number {
  const sat = rhythmToLiveSat(res);
  state.buffs.liveSat += sat;
  if (res.accuracy >= 0.75) {
    for (const m of state.members) if (!m.isLeader) m.love = Math.min(100, m.love + 2);
  }
  if (res.accuracy >= 0.9) state.fame = Math.min(100, state.fame + 1);
  return sat;
}
