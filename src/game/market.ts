// Market / meta layer: audience TRENDS, RIVAL bands, and TIE-UPS. Pure logic +
// tunable constants; coreLoop reads the multipliers, state.ts drives the monthly
// tick and the live→market feedback.
//
// The three systems all bend the same knob — how many new fans a targeted live
// pulls from a segment — so "which segment do I attack this month" becomes a
// live read of the market instead of a fixed optimum.

import type { GameState, Rival, Segment } from "./types";
import { SEGMENTS, segLabel } from "./types";
import { L } from "./i18n";

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export const MK = {
  trendMin: 0.7,
  trendMax: 1.4,
  trendDrift: 0.14, // monthly random-walk step
  trendRevert: 0.12, // pull back toward 1.0 (mean reversion)
  rivalGrowth: 4, // rival momentum gained per month
  rivalMax: 100,
  rivalBeatPer: 0.7, // momentum knocked off per satisfaction point over 50
  rivalThrottle: 0.5, // fan multiplier reduction at full rival momentum
  rivalLeadBoost: 0.15, // fan multiplier bonus when you fully dominate
  tieupAlign: 0.3, // +30% fans/streams for the tie-up's own segment
  tieupOppose: -0.22, // −22% for the opposed segment (image lock)
  tieupTerm: 3, // months a tie-up lasts
  tieupOfferChance: 0.4, // chance of an offer on a normal month with none active
} as const;

/** Thematic opposites (a tie-up toward one alienates the other). */
export const OPPOSED: Record<Segment, Segment> = {
  visual: "core", // 耽美/映え ↔ 硬派の王道
  core: "visual",
  light: "expert", // ポップ/可愛い ↔ 玄人の重厚
  expert: "light",
};

// ---- trend -----------------------------------------------------------------
export const trendMult = (s: GameState, seg: Segment): number => s.trend?.[seg] ?? 1;
export const hottestSegment = (s: GameState): Segment =>
  SEGMENTS.reduce((best, seg) => (trendMult(s, seg) > trendMult(s, best) ? seg : best), SEGMENTS[0]);
/** ▲ hot / ▽ cold / ・ neutral icon for a segment's current trend. */
export const trendIcon = (v: number): string => (v >= 1.15 ? "🔥" : v <= 0.88 ? "❄️" : "・");

// ---- rivals ----------------------------------------------------------------
export const rivalOf = (s: GameState, seg: Segment): Rival | undefined =>
  s.rivals?.find((r) => r.seg === seg);
/** Fan multiplier from rival pressure: they throttle you as they dominate. */
export function rivalMult(s: GameState, seg: Segment): number {
  const r = rivalOf(s, seg);
  if (!r) return 1;
  return clamp(1 + MK.rivalLeadBoost - (r.momentum / 100) * (MK.rivalThrottle + MK.rivalLeadBoost), 1 - MK.rivalThrottle, 1 + MK.rivalLeadBoost);
}
/** Do we out-draw the rival in this segment right now? (our seg fans vs momentum) */
export const leadingRival = (s: GameState, seg: Segment): boolean => {
  const r = rivalOf(s, seg);
  return !!r && r.momentum < 40;
};

// ---- tie-ups ---------------------------------------------------------------
export function tieupMult(s: GameState, seg: Segment): number {
  const t = s.tieup;
  if (!t) return 1;
  if (t.seg === seg) return 1 + MK.tieupAlign;
  if (OPPOSED[t.seg] === seg) return 1 + MK.tieupOppose;
  return 1;
}

// ---- combined --------------------------------------------------------------
/** Fan multiplier applied to a targeted live's new fans (all three systems). */
export const marketFanMult = (s: GameState, seg: Segment): number =>
  trendMult(s, seg) * rivalMult(s, seg) * tieupMult(s, seg);
/** Streams follow trend + tie-up (rivals matter less to streaming). */
export const marketStreamMult = (s: GameState, seg: Segment): number =>
  trendMult(s, seg) * tieupMult(s, seg);

// ---- song direction (楽曲属性) ---------------------------------------------
/** A lean distribution weighted toward one segment (sums to 1.0). */
export function leanToward(seg: Segment): Record<Segment, number> {
  const out = {} as Record<Segment, number>;
  for (const x of SEGMENTS) out[x] = x === seg ? 0.55 : 0.15;
  return out;
}
/** The segment a song leans toward most (for UI labels). */
export const songDir = (lean: Record<Segment, number>): Segment =>
  SEGMENTS.reduce((best, seg) => (lean[seg] > lean[best] ? seg : best), SEGMENTS[0]);

// ---- setup + monthly tick --------------------------------------------------
const RIVAL_NAMES: Record<Segment, string> = {
  core: L("鉄血コマンド", "Ironblood Command"),
  light: L("ポップ・ネメシス", "Pop Nemesis"),
  visual: L("紅薔薇ノワール", "Crimson Rose Noir"),
  expert: L("深淵ヴォイド", "Abyssal Void"),
};
const TIEUP_NAMES: Record<Segment, string> = {
  core: L("硬派ロック番組のテーマ曲", "Hard-rock TV show theme"),
  light: L("人気アニメOPタイアップ", "Hit anime OP tie-up"),
  visual: L("ファッション誌のビジュアル特集", "Fashion-mag visual feature"),
  expert: L("音楽誌クロスレビュー巻頭特集", "Music-mag cover cross-review"),
};

export function initMarket(): Pick<GameState, "trend" | "rivals" | "tieup" | "tieupOffer"> {
  const trend = {} as Record<Segment, number>;
  // slight starting variety so month 1 already has a shape (fixed, no RNG here).
  const seed: Record<Segment, number> = { core: 1.08, light: 1.0, visual: 0.92, expert: 1.0 };
  for (const s of SEGMENTS) trend[s] = seed[s];
  const rivals: Rival[] = SEGMENTS.map((seg) => ({ name: RIVAL_NAMES[seg], seg, momentum: 45 }));
  return { trend, rivals, tieup: null, tieupOffer: null };
}

/** Monthly market movement: drift trends, grow rivals, age the tie-up, maybe
 *  surface a new offer. Returns log lines to surface. */
export function tickMarket(state: GameState, rng: () => number): string[] {
  const logs: string[] = [];
  // trends: mean-reverting random walk.
  for (const s of SEGMENTS) {
    const cur = state.trend[s];
    const step = (rng() - 0.5) * 2 * MK.trendDrift + (1 - cur) * MK.trendRevert;
    state.trend[s] = clamp(cur + step, MK.trendMin, MK.trendMax);
  }
  const hot = hottestSegment(state);
  logs.push(L(`📈 今月の注目客層：${segLabel(hot)}（トレンド上昇中）`, `📈 Hot audience this month: ${segLabel(hot)} (trending up)`));

  // rivals grind upward (you push them back by playing to their segment — live feedback).
  for (const r of state.rivals) r.momentum = clamp(r.momentum + MK.rivalGrowth, 0, MK.rivalMax);

  // tie-up ages out.
  if (state.tieup) {
    state.tieup.monthsLeft -= 1;
    if (state.tieup.monthsLeft <= 0) {
      logs.push(L(`🤝 タイアップ「${state.tieup.name}」の契約期間が終了した。`, `🤝 The tie-up "${state.tieup.name}" has ended.`));
      state.tieup = null;
    }
  }

  // offer a new tie-up (usually toward a hot segment) when none active/pending.
  if (!state.tieup && !state.tieupOffer && rng() < MK.tieupOfferChance) {
    const seg = rng() < 0.6 ? hot : SEGMENTS[Math.floor(rng() * SEGMENTS.length)];
    const fee = 60_000 + Math.floor(rng() * 90_000);
    state.tieupOffer = { name: TIEUP_NAMES[seg], seg, monthsLeft: MK.tieupTerm, fee };
  }
  return logs;
}

/** After a live: a strong targeted show pushes that segment's rival back;
 *  a weak one lets them consolidate. */
export function applyLiveToMarket(state: GameState, target: Segment, satisfaction: number): void {
  const r = rivalOf(state, target);
  if (!r) return;
  const delta = (satisfaction - 50) * MK.rivalBeatPer;
  r.momentum = clamp(r.momentum - delta, 0, MK.rivalMax);
}

/** Accept the pending tie-up: pay the fee, kick off an immediate segment surge. */
export function acceptTieup(state: GameState): void {
  const t = state.tieupOffer;
  if (!t) return;
  state.tieup = { ...t };
  state.tieupOffer = null;
  state.funds += t.fee;
  const fans = 300 + Math.round(state.totalFans * 0.05);
  state.segFans[t.seg] += fans;
  state.totalFans += fans;
  state.fame = Math.min(100, state.fame + 4);
}
