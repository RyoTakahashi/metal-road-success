// Build-time edition switch. The SHORT edition (for itch.io / casual play) ends
// at the 3rd checkpoint (Major-Label Debut); the LONG edition runs all five.
//
// The value is injected by Vite at build time via `define` (see vite.config.ts),
// driven by the EDITION env var: `EDITION=short vite build`. Outside Vite (e.g.
// the esbuild-bundled simulator, or a plain node context) the global is absent,
// so it safely falls back to "long".

declare const __METAL_EDITION__: string | undefined;

const raw: string =
  typeof __METAL_EDITION__ !== "undefined" ? __METAL_EDITION__ : "long";

export type Edition = "short" | "long";
export const EDITION: Edition = raw === "short" ? "short" : "long";
export const IS_SHORT = EDITION === "short";

/** How many checkpoints this edition runs (short stops after Major Debut). */
export const EDITION_MILESTONE_COUNT = IS_SHORT ? 3 : 5;
