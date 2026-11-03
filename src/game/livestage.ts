// Live-stage mini-game — pure real-time simulation (no DOM), so it can be unit-
// tested / calibrated headlessly. The on-screen player (src/ui/livestage.ts)
// drives it: call tick(dt) every frame, read the returned view to draw, and
// forward player inputs via hype() / recover(). The crowd-heat average + how
// well the band's wobbles were caught convert into the live's satisfaction
// bonus (buffs.liveSat), so it slots into resolveLive unchanged.

import type { GameState, Segment } from "./types";

export const LS = {
  durationMs: 34000, // length of the performance
  startHeat: 55,
  decayPerSec: 4, // crowd cools on its own
  wobbleDecayPerSec: 6, // extra bleed while a member is struggling
  hypeBig: 18, // hype during a receptive window
  hypeSmall: 4, // hype outside a window (plus a cooldown)
  hypeCooldownMs: 650,
  recoverHeat: 8, // heat bump for catching a wobble in time
  windowEveryMs: 2600, // a "受けてる" (receptive) window opens this often…
  windowLenMs: 1400, // …and stays open this long
  wobbleEveryMsMin: 3600, // a member starts struggling every 3.6–6s
  wobbleEveryMsMax: 6000,
  wobbleGraceMs: 2600, // time to catch it before it costs heat
  missPenalty: 9, // heat lost when a wobble isn't caught
  // satisfaction mapping (banked into buffs.liveSat). Tuned so a decent run
  // (~65 avg heat, ~70% wobbles caught) lands near the old menu avg (~19.7).
  satFromHeat: 18,
  satFromRecover: 6,
};

export interface MemberView { key: string; wobbling: boolean }
export interface StageView {
  heat: number;
  windowOpen: boolean; // crowd is receptive — hype now!
  members: MemberView[];
  timeLeftMs: number;
  hypeReady: boolean; // false briefly after an off-window hype (cooldown)
}
export interface StageResult {
  avgHeat: number;
  peakHeat: number;
  hypeHits: number;
  hypeMiss: number;
  wobbleTotal: number;
  wobbleRecovered: number;
  recoverRatio: number;
}

interface Wob { key: string; since: number; graceUntil: number }

export class StageSim {
  private t = 0; // elapsed ms
  heat: number;
  private keys: string[];
  private rng: () => number;
  // scheduling
  private nextWindowAt = 1200;
  private windowUntil = -1;
  private nextWobbleAt: number;
  private wob: Wob | null = null;
  private hypeCdUntil = -1;
  // accumulators
  private heatSum = 0;
  private samples = 0;
  peak = 0;
  hypeHits = 0;
  hypeMiss = 0;
  wobbleTotal = 0;
  wobbleRecovered = 0;

  constructor(keys: string[], rng: () => number = Math.random) {
    this.keys = keys.slice();
    this.rng = rng;
    this.heat = LS.startHeat;
    this.peak = LS.startHeat;
    this.nextWobbleAt = this.randRange(1800, 3200);
  }
  private randRange(a: number, b: number): number { return a + this.rng() * (b - a); }
  private clampHeat(): void { this.heat = Math.max(0, Math.min(100, this.heat)); }

  /** Advance the simulation by dt ms. Returns the current view for rendering. */
  tick(dtMs: number): StageView {
    const dt = Math.min(dtMs, 60); // guard against tab-switch jumps
    this.t += dt;
    const sec = dt / 1000;

    // receptive-window scheduling
    if (this.t >= this.nextWindowAt && this.windowUntil < 0) {
      this.windowUntil = this.t + LS.windowLenMs;
      this.nextWindowAt = this.t + LS.windowEveryMs;
    }
    if (this.windowUntil >= 0 && this.t > this.windowUntil) this.windowUntil = -1;

    // wobble scheduling
    if (!this.wob && this.t >= this.nextWobbleAt) {
      const key = this.keys[Math.floor(this.rng() * this.keys.length)];
      this.wob = { key, since: this.t, graceUntil: this.t + LS.wobbleGraceMs };
      this.wobbleTotal += 1;
    }
    // uncaught wobble → heat penalty, then it resolves on its own
    if (this.wob && this.t > this.wob.graceUntil) {
      this.heat -= LS.missPenalty;
      this.wob = null;
      this.nextWobbleAt = this.t + this.randRange(LS.wobbleEveryMsMin, LS.wobbleEveryMsMax);
    }

    // heat decay (extra while a member struggles)
    let decay = LS.decayPerSec;
    if (this.wob) decay += LS.wobbleDecayPerSec;
    this.heat -= decay * sec;
    this.clampHeat();

    this.heatSum += this.heat * sec;
    this.samples += sec;
    this.peak = Math.max(this.peak, this.heat);

    return {
      heat: this.heat,
      windowOpen: this.windowUntil >= 0,
      members: this.keys.map((k) => ({ key: k, wobbling: this.wob?.key === k })),
      timeLeftMs: Math.max(0, LS.durationMs - this.t),
      hypeReady: this.t >= this.hypeCdUntil,
    };
  }

  /** Player hypes the crowd. Big during a receptive window; small + cooldown off. */
  hype(): "big" | "small" | "cooldown" {
    if (this.windowUntil >= 0) {
      this.heat += LS.hypeBig;
      this.clampHeat();
      this.windowUntil = -1; // consume the window
      this.hypeHits += 1;
      return "big";
    }
    if (this.t < this.hypeCdUntil) return "cooldown";
    this.heat += LS.hypeSmall;
    this.clampHeat();
    this.hypeCdUntil = this.t + LS.hypeCooldownMs;
    this.hypeMiss += 1;
    return "small";
  }

  /** Player locks in with a struggling member. Only the current wobbler counts. */
  recover(key: string): boolean {
    if (this.wob && this.wob.key === key) {
      this.heat += LS.recoverHeat;
      this.clampHeat();
      this.wob = null;
      this.wobbleRecovered += 1;
      this.nextWobbleAt = this.t + this.randRange(LS.wobbleEveryMsMin, LS.wobbleEveryMsMax);
      return true;
    }
    return false;
  }

  /** The artKey of the member currently struggling, or null. */
  currentWobbler(): string | null { return this.wob?.key ?? null; }

  get done(): boolean { return this.t >= LS.durationMs; }

  finish(): StageResult {
    const avgHeat = this.samples > 0 ? this.heatSum / this.samples : this.heat;
    return {
      avgHeat,
      peakHeat: this.peak,
      hypeHits: this.hypeHits,
      hypeMiss: this.hypeMiss,
      wobbleTotal: this.wobbleTotal,
      wobbleRecovered: this.wobbleRecovered,
      recoverRatio: this.wobbleTotal > 0 ? this.wobbleRecovered / this.wobbleTotal : 1,
    };
  }
}

/** Heat level bucket for choosing the crowd sprite. */
export function heatLevel(heat: number): "low" | "mid" | "high" {
  return heat >= 70 ? "high" : heat >= 38 ? "mid" : "low";
}

export function stageToLiveSat(res: StageResult): number {
  return Math.round((res.avgHeat / 100) * LS.satFromHeat + res.recoverRatio * LS.satFromRecover);
}

export function stageGrade(res: StageResult): string {
  const score = (res.avgHeat / 100) * 0.75 + res.recoverRatio * 0.25;
  if (score >= 0.92) return "SS";
  if (score >= 0.82) return "S";
  if (score >= 0.7) return "A";
  if (score >= 0.55) return "B";
  if (score >= 0.4) return "C";
  return "D";
}

/** Bank the performance into state: satisfaction + a little affection/fame. */
export function applyStageResult(state: GameState, res: StageResult): number {
  const sat = stageToLiveSat(res);
  state.buffs.liveSat += sat;
  if (res.avgHeat >= 60) for (const m of state.members) if (!m.isLeader) m.love = Math.min(100, m.love + 2);
  if (res.avgHeat >= 78) state.fame = Math.min(100, state.fame + 1);
  return sat;
}

// Exported only so the UI can label the target crowd; staging-vs-segment affinity
// is intentionally light in this MVP (reading the crowd's heat is the core skill).
export type { Segment };
