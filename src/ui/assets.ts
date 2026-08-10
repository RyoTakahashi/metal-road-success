// Asset manifest. Swap a value here (e.g. an AI-generated .png) to replace the
// placeholder art with no code changes elsewhere. Files live under public/assets.

import type { BgKey } from "../game/types";

const base = import.meta.env.BASE_URL; // honors vite `base`

export const BG_SRC: Record<BgKey, string> = {
  studio: `${base}assets/bg/studio.v1.png`,
  street: `${base}assets/bg/street.v1.png`,
  venueSmall: `${base}assets/bg/venue_small.v1.png`,
  venueBig: `${base}assets/bg/venue_big.v1.png`,
  backstage: `${base}assets/bg/backstage.v1.png`,
};

export type Mood = "normal" | "fired" | "happy" | "sad";

// Character version per member. Bump when the look changes (see docs/assets.md);
// the filename is `{id}.v{version}.{mood}.png`, or with an evolution infix
// `{id}.v{version}.{evo}.{mood}.png` (e.g. ryo.v2.glam.fired.png).
const CHAR_VER: Record<string, number> = { RYO: 2, KEN: 2, MIO: 2, GO: 2 };

/** Live-audience segment -> appearance-evolution filename infix. */
export const EVO_INFIX: Record<string, string> = {
  visual: "glam", // ビジュ: 妖艶 / グラム
  core: "heavy", //  コア:  重鋼 / ヘヴィ
  light: "pop", //   ライト: 煌ポップ
  expert: "virtuoso", // 玄人: 静玄 / 技巧
};

// Flip to true once the evolution sprites actually exist on disk (per member ×
// per evolution × per mood). Until then the game shows the base look even when
// an evolution is "unlocked", so nothing 404s.
const EVO_ART_READY = false;

// The band's current evolution (a segment key, or "" for base). Set once per
// render from state.evolution so charSrc callers don't each need to thread it.
let currentEvo = "";
export const setEvolution = (evo: string): void => { currentEvo = evo; };

export const bgSrc = (k: BgKey): string => BG_SRC[k] ?? BG_SRC.studio;

/** Resolve a member's standing art for a mood (evolution-aware). */
export const charSrc = (member: string, mood: Mood = "normal"): string => {
  const key = member in CHAR_VER ? member : "RYO";
  const v = CHAR_VER[key];
  const infix = EVO_ART_READY && EVO_INFIX[currentEvo] ? `.${EVO_INFIX[currentEvo]}` : "";
  return `${base}assets/chars/${key.toLowerCase()}.v${v}${infix}.${mood}.png`;
};
