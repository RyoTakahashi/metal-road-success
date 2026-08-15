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
// `{id}.v{version}.{evo}.{mood}.png` (e.g. ryo.v2.goth.fired.png).
const CHAR_VER: Record<string, number> = { RYO: 2, KEN: 2, MIO: 2, GO: 2 };

// Flip to true once the evolution sprites exist on disk. Enabled: all 4 members
// × 4 single-genre looks × 4 moods, plus the 6 pair fusions + ultimate (normal).
const EVO_ART_READY = true;
// Fusion looks (pairs + ultimate) currently ship at `normal` only; their other
// moods reuse the fusion's normal sprite. Single-genre looks have all four moods.
const FUSION_MOOD_READY = false;

// The band's current appearance infix, resolved from the unlocked set via
// evolutionInfix (game/evolution): "" = base, "goth".. = single, "hard-kawaii"..
// = pair fusion, "ultimate" = 3+. Set once per render so charSrc needn't thread it.
let currentEvo = "";
export const setEvolution = (evo: string): void => { currentEvo = evo; };

export const bgSrc = (k: BgKey): string => BG_SRC[k] ?? BG_SRC.studio;

/** Resolve a member's standing art for a mood (evolution-aware, fusion-aware). */
export const charSrc = (member: string, mood: Mood = "normal"): string => {
  const key = member in CHAR_VER ? member : "RYO";
  const v = CHAR_VER[key];
  const lc = key.toLowerCase();
  if (!EVO_ART_READY || !currentEvo) return `${base}assets/chars/${lc}.v${v}.${mood}.png`;
  const isFusion = currentEvo.includes("-") || currentEvo === "ultimate";
  const m = isFusion && !FUSION_MOOD_READY ? "normal" : mood; // fusions: normal only for now
  return `${base}assets/chars/${lc}.v${v}.${currentEvo}.${m}.png`;
};
