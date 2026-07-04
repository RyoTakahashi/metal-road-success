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
const MOODS: Mood[] = ["normal", "fired", "happy", "sad"];

// Character version per member. Bump when the look changes (see docs/assets.md);
// the filename is `{id}.v{version}.{mood}.png`, so old versions stay on disk.
const CHAR_VER: Record<string, number> = { RYO: 1, KEN: 1, MIO: 1, GO: 1 };

/** Standing art per member, with one image per mood. */
export const CHAR_SRC: Record<string, Record<Mood, string>> = Object.fromEntries(
  Object.entries(CHAR_VER).map(([member, v]) => [
    member,
    Object.fromEntries(
      MOODS.map((m) => [m, `${base}assets/chars/${member.toLowerCase()}.v${v}.${m}.png`]),
    ) as Record<Mood, string>,
  ]),
);

export const bgSrc = (k: BgKey): string => BG_SRC[k] ?? BG_SRC.studio;

/** Resolve a member's standing art for a mood, falling back to normal / RYO. */
export const charSrc = (member: string, mood: Mood = "normal"): string => {
  const set = CHAR_SRC[member] ?? CHAR_SRC.RYO;
  return set[mood] ?? set.normal;
};
