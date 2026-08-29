// Tiny i18n: a current language + an inline bilingual helper `L(ja, en)`.
// Strings produced at call time (render(), scene builders) switch immediately;
// module-load constants must be built through lang-aware lookups (see the
// *Label helpers in types.ts) rather than captured once.

export type Lang = "ja" | "en";

let current: Lang = "ja";
let chosen = false;
try {
  const v = localStorage.getItem("mr_lang");
  if (v === "ja" || v === "en") { current = v; chosen = true; }
} catch {
  /* storage unavailable — default to ja, unchosen */
}

export const getLang = (): Lang => current;
export const langChosen = (): boolean => chosen;

export function setLang(l: Lang): void {
  current = l;
  chosen = true;
  try { localStorage.setItem("mr_lang", l); } catch { /* ignore */ }
}

/** Inline bilingual string: returns the English text under `en`, else Japanese. */
export const L = (ja: string, en: string): string => (current === "en" ? en : ja);
