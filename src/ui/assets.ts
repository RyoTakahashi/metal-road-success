// Asset manifest. Swap a value here (e.g. an AI-generated .png) to replace the
// placeholder art with no code changes elsewhere. Files live under public/assets.

import type { BgKey } from "../game/types";

const base = import.meta.env.BASE_URL; // honors vite `base`

export const BG_SRC: Record<BgKey, string> = {
  studio: `${base}assets/bg/studio.svg`,
  street: `${base}assets/bg/street.svg`,
  venueSmall: `${base}assets/bg/venue_small.svg`,
  venueBig: `${base}assets/bg/venue_big.svg`,
  backstage: `${base}assets/bg/backstage.svg`,
};

/** Character standing art, keyed by member name. */
export const CHAR_SRC: Record<string, string> = {
  RYO: `${base}assets/chars/ryo.svg`,
  KEN: `${base}assets/chars/ken.svg`,
  MIO: `${base}assets/chars/mio.svg`,
  GO: `${base}assets/chars/go.svg`,
};

export const bgSrc = (k: BgKey): string => BG_SRC[k] ?? BG_SRC.studio;
export const charSrc = (member: string): string => CHAR_SRC[member] ?? CHAR_SRC.RYO;
