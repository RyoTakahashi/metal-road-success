// Live-stage mini-game — logic & data (no DOM). The on-screen player
// (src/ui/livestage.ts) runs the flow: for each beat it shows a choice (like the
// old live MC/song prompts), then a part-button COMMAND whose tempo & length
// depend on the chosen option; the player inputs it in time. A beat's payoff
// combines the choice's crowd fit (正解/普通/不正解) with input accuracy. The
// crowd (heat) is pure visual feedback here — no gauge to manage. The total
// converts into the live's satisfaction bonus (buffs.liveSat).

import type { GameState, Segment } from "./types";
import { getLang, type Lang } from "./i18n";

type Loc = Record<Lang, string>;
const t = (ja: string, en: string): Loc => ({ ja, en });
export const locStr = (l: Loc): string => l[getLang()];

// The four part-buttons map to the four members (Vo / Gt / Ba / Dr).
export type PartKey = "RYO" | "KEN" | "MIO" | "GO";
export const PART_ORDER: PartKey[] = ["RYO", "KEN", "MIO", "GO"];
export const PART_LABEL: Record<PartKey, Loc> = {
  RYO: t("Vo", "Vo"), KEN: t("Gt", "Gt"), MIO: t("Ba", "Ba"), GO: t("Dr", "Dr"),
};
// Desktop keys, left→right under the four on-screen buttons.
export const PART_KEY: Record<string, PartKey> = {
  d: "RYO", f: "KEN", j: "MIO", k: "GO", D: "RYO", F: "KEN", J: "MIO", K: "GO",
};
export const PART_KEYCAP: Record<PartKey, string> = { RYO: "D", KEN: "F", MIO: "J", GO: "K" };
// The part that "aces" each crowd (reverse of the solo affinity) — featured more
// in that option's command so the combo feels themed to the choice.
const ACE_PART: Record<Segment, PartKey> = { visual: "RYO", core: "KEN", expert: "MIO", light: "GO" };

export type Intensity = "calm" | "mid" | "wild";
// stepMs is the gap between notes (= the minimum interval; the chart is uniform,
// so even "wild" never clusters tighter than this). Kept comfortably slow so the
// command is easy to read and follow.
export const INTENSITY: Record<Intensity, { steps: number; stepMs: number; beats: number; tag: Loc }> = {
  calm: { steps: 4, stepMs: 720, beats: 1, tag: t("静", "Calm") },
  mid: { steps: 5, stepMs: 600, beats: 2, tag: t("中", "Mid") },
  wild: { steps: 6, stepMs: 500, beats: 3, tag: t("激", "Wild") },
};

export interface BeatOption {
  label: Loc;
  seg: Segment; // crowd fit (resolved vs the night's target → 正解/普通/不正解)
  intensity: Intensity; // drives the command's tempo & length
}
export interface Beat { prompt: Loc; options: BeatOption[] } // 3 options, distinct segs

// Four beats, mirroring the old live flow. Each beat's three options use three
// DISTINCT crowds so exactly one is 正解 / 普通 / 不正解 for any target.
export const BEATS: Beat[] = [
  {
    prompt: t("【本編・MC】第一声、どう入る？", "[Set / MC] Your opening line?"),
    options: [
      { label: t("「声が枯れるまで叫べェ——ッ!!」", "\"Scream till your voice gives out!!\""), seg: "core", intensity: "wild" },
      { label: t("「みんなで最高の夜にしよう！」", "\"Let's make this the best night together!\""), seg: "light", intensity: "mid" },
      { label: t("「……来てくれて、ありがとう」", "\"...Thank you for coming.\""), seg: "expert", intensity: "calm" },
    ],
  },
  {
    prompt: t("【本編・ソロ回し】見せ場、どう作る？", "[Set / Solo] How do you build the showcase?"),
    options: [
      { label: t("妖艶に魅せる、耽美のソロ", "A bewitching, decadent solo"), seg: "visual", intensity: "mid" },
      { label: t("技巧の限りを尽くす超速ソロ", "A blistering, virtuosic solo"), seg: "expert", intensity: "wild" },
      { label: t("手拍子で巻き込む楽しいソロ", "A fun, clap-along solo"), seg: "light", intensity: "calm" },
    ],
  },
  {
    prompt: t("【アンコール・MC】締めの煽り、どういく？", "[Encore / MC] How do you rile them up?"),
    options: [
      { label: t("「まだ暴れ足りねぇよなァ!?」", "\"You're not done raging yet, right!?\""), seg: "core", intensity: "wild" },
      { label: t("「この景色、目に焼き付けて」", "\"Burn this view into your eyes.\""), seg: "visual", intensity: "calm" },
      { label: t("「最後まで一緒に跳ねよう！」", "\"Jump with us to the very end!\""), seg: "light", intensity: "mid" },
    ],
  },
  {
    prompt: t("【アンコール・締め】ラストは？", "[Encore / Close] The final song?"),
    options: [
      { label: t("定番曲で全員大合唱", "A crowd favorite, everyone singing"), seg: "light", intensity: "mid" },
      { label: t("攻めの未発表曲で勝負", "Gamble on a daring unreleased song"), seg: "expert", intensity: "wild" },
      { label: t("バラードでしっとり締める", "Close softly with a ballad"), seg: "visual", intensity: "calm" },
    ],
  },
];

// --- crowd fit (shared with the rest of the game's affinity model) -----------
const SEG_ALLY: Record<Segment, Segment> = { visual: "light", light: "visual", core: "expert", expert: "core" };
const OPPOSED: Record<Segment, Segment> = { visual: "core", core: "visual", light: "expert", expert: "light" };
const resonance = (target: Segment, seg: Segment): number =>
  seg === target ? 3 : SEG_ALLY[target] === seg ? 2 : OPPOSED[target] === seg ? 0 : 1;
/** Tier of each option vs the target: 0 = 正解, 1 = 普通, 2 = 不正解 (distinct segs → one each). */
export function optionTiers(beat: Beat, target: Segment): number[] {
  const ranked = beat.options
    .map((o, i) => ({ i, r: resonance(target, o.seg) }))
    .sort((a, b) => b.r - a.r || a.i - b.i);
  const tier = new Array<number>(beat.options.length);
  ranked.forEach((o, rank) => { tier[o.i] = rank; });
  return tier;
}

// --- command generation ------------------------------------------------------
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let x = Math.imul(a ^ (a >>> 15), 1 | a); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}
export interface CmdStep { t: number; part: PartKey }
export interface Command { steps: CmdStep[]; stepMs: number; totalMs: number; intensity: Intensity }
export function buildCommand(opt: BeatOption, seed: number): Command {
  const cfg = INTENSITY[opt.intensity];
  const r = rng(seed);
  const ace = ACE_PART[opt.seg];
  const steps: CmdStep[] = [];
  let prev: PartKey | null = null;
  for (let i = 0; i < cfg.steps; i++) {
    let part = r() < 0.45 ? ace : PART_ORDER[Math.floor(r() * 4)];
    if (part === prev && r() < 0.6) part = PART_ORDER[(PART_ORDER.indexOf(part) + 1) % 4];
    prev = part;
    steps.push({ t: i * cfg.stepMs, part });
  }
  return { steps, stepMs: cfg.stepMs, totalMs: cfg.steps * cfg.stepMs + cfg.stepMs, intensity: opt.intensity };
}

// Hit-timing windows for the command QTE (lenient — this is a management sim,
// not a hardcore rhythm game).
export const HIT = { perfectMs: 95, goodMs: 200 };

// --- scoring -----------------------------------------------------------------
export interface BeatOutcome { tier: number; exec: number; intensity: Intensity } // exec 0..1
export const SATQ = {
  choiceQ: [1, 0.72, 0.42] as const, // 正解 / 普通 / 不正解
  intMult: { calm: 0.9, mid: 1.0, wild: 1.15 } as Record<Intensity, number>,
  satSpan: 28, // avg beat score × this: decent ~19, great ~28 (parity with old ~20)
};
export function beatScore(o: BeatOutcome): number {
  return Math.max(0, Math.min(1.2, o.exec * SATQ.choiceQ[o.tier] * SATQ.intMult[o.intensity]));
}

export interface StageResult {
  beats: BeatOutcome[];
  avgScore: number;
  avgExec: number;
  perfects: number;
  hits: number;
  steps: number;
  sat: number;
}
export function finalize(beats: BeatOutcome[], perfects: number, hits: number, steps: number): StageResult {
  const avgScore = beats.length ? beats.reduce((a, b) => a + beatScore(b), 0) / beats.length : 0;
  const avgExec = beats.length ? beats.reduce((a, b) => a + b.exec, 0) / beats.length : 0;
  return { beats, avgScore, avgExec, perfects, hits, steps, sat: Math.round(avgScore * SATQ.satSpan) };
}

/** Excitement 0..100 for the crowd visual, from the run so far (feedback only). */
export function excitement(scoresSoFar: number[]): number {
  if (!scoresSoFar.length) return 45;
  const avg = scoresSoFar.reduce((a, b) => a + b, 0) / scoresSoFar.length;
  return Math.max(0, Math.min(100, 30 + avg * 70));
}
export function heatLevel(heat: number): "low" | "mid" | "high" {
  return heat >= 68 ? "high" : heat >= 40 ? "mid" : "low";
}

export function stageGrade(res: StageResult): string {
  const s = res.avgScore;
  if (s >= 1.0) return "SS";
  if (s >= 0.88) return "S";
  if (s >= 0.74) return "A";
  if (s >= 0.58) return "B";
  if (s >= 0.4) return "C";
  return "D";
}

/** Bank the performance into state: satisfaction + a little affection/fame. */
export function applyStageResult(state: GameState, res: StageResult): number {
  state.buffs.liveSat += res.sat;
  if (res.avgScore >= 0.6) for (const m of state.members) if (!m.isLeader) m.love = Math.min(100, m.love + 2);
  if (res.avgScore >= 0.85) state.fame = Math.min(100, state.fame + 1);
  return res.sat;
}
