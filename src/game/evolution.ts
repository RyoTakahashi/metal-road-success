// Appearance-evolution look resolution (cumulative fusion).
//
// Each audience segment maps to a metal-subgenre look. The band's CURRENT look
// is a function of the SET of segments unlocked by S-rated lives:
//   0 unlocked -> base art
//   1 unlocked -> that single genre     (goth / hard / kawaii / death)
//   2 unlocked -> that pair's fusion    (infixes joined by "-" in segment order)
//   3+ unlocked -> the "ultimate" look  (triples and the full four collapse here)
//
// The returned string is the sprite-filename infix: {id}.v2.{infix}.{mood}.webp
// (empty string = base art, no infix).

import type { Segment } from "./types";
import { L } from "./i18n";

export const SEG_INFIX: Record<Segment, string> = {
  visual: "goth", // ビジュ: 幽艶ゴシック
  core: "hard", //   コア:   鋼鉄ハードロック
  light: "kawaii", // ライト: 紅黒カワメタ
  expert: "death", // 玄人:   戦鬼デスメタル
};

const SEG_ORDER: Segment[] = ["visual", "core", "light", "expert"];

/** Sprite infix for the current unlocked set (see module doc). */
export function evolutionInfix(unlocked: Record<string, boolean>): string {
  const segs = SEG_ORDER.filter((s) => unlocked[s]);
  if (segs.length === 0) return "";
  if (segs.length === 1) return SEG_INFIX[segs[0]];
  if (segs.length === 2) return segs.map((s) => SEG_INFIX[s]).join("-");
  return "ultimate";
}

/** Display name + evolution-scene description for every look (single/pair/ult). */
export const EVO_LOOK: Record<string, { name: string; desc: string }> = {
  // singles
  goth: { name: L("幽艶ゴシック", "Ethereal Goth"), desc: L("漆黒のレースと深紅を纏い、荘厳で物憂げなゴシック/シンフォニックの妖艶な姿へ。", "Draped in black lace and deep crimson — a solemn, wistful gothic/symphonic beauty.") },
  hard: { name: L("鋼鉄ハードロック", "Steel Hard Rock"), desc: L("革とスタッズ、王道の轟音。正統派ハードロックの風格ある姿へ。", "Leather and studs, the roar of the classics — a dignified hard-rock look.") },
  kawaii: { name: L("紅黒カワメタ", "Kawaii Metal"), desc: L("黒と紅のフリルで可憐に暴れる、キュート×激烈のカワイイメタルの姿へ。", "Rampaging cute in black-and-red frills — a cute-yet-savage kawaii-metal look.") },
  death: { name: L("戦鬼デスメタル", "War Death Metal"), desc: L("コープスペイントと鋲、戦装束。ウォー/デスメタルの獰猛な姿へ。", "Corpse paint, spikes and war garb — a ferocious war/death-metal look.") },
  // pairs
  "goth-hard": { name: L("耽美ヘヴィ", "Decadent Heavy"), desc: L("ゴシックの妖艶と鋼鉄の重厚が融合、王道ゴシックメタルの姿へ。", "Gothic allure fused with steel heft — a classic gothic-metal look.") },
  "goth-kawaii": { name: L("幽艶ゴシックロリータ", "Gothic Lolita"), desc: L("闇の耽美と可憐が溶け合う、病みかわ耽美アイドルの姿へ。", "Dark decadence melts into cuteness — a morbid-cute idol look.") },
  "goth-death": { name: L("暗黒シンフォニック", "Dark Symphonic"), desc: L("荘厳な美と獰猛が交わる、シンフォニック・ブラック/デスの姿へ。", "Solemn beauty meets ferocity — a symphonic black/death look.") },
  "hard-kawaii": { name: L("電撃アイドルメタル", "Idol Power Metal"), desc: L("轟音と可憐が弾ける、パワー系アイドルメタルの姿へ。", "Roar and cuteness burst together — a power idol-metal look.") },
  "hard-death": { name: L("漆黒スラッシュ", "Blackened Thrash"), desc: L("鋼鉄の疾走と死の獰猛が結び、ブラッケンド・スラッシュの姿へ。", "Steel speed bound to deathly ferocity — a blackened-thrash look.") },
  "kawaii-death": { name: L("地獄カワメタ", "Hellish Kawaii"), desc: L("可憐と残虐が同居する、デスコア・アイドルの姿へ。", "Cuteness and brutality side by side — a deathcore idol look.") },
  // ultimate (3 or 4 unlocked)
  ultimate: { name: L("真・伝説", "True Legend"), desc: L("全ての客層を制した者だけが至る、究極の姿へ——！", "The ultimate form, reached only by those who've conquered every audience!") },
};

/** Look name for the current unlocked set (for HUD / logs). "" if base. */
export const lookName = (unlocked: Record<string, boolean>): string =>
  EVO_LOOK[evolutionInfix(unlocked)]?.name ?? "";
