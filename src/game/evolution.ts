// Appearance-evolution look resolution (cumulative fusion).
//
// Each audience segment maps to a metal-subgenre look. The band's CURRENT look
// is a function of the SET of segments unlocked by S-rated lives:
//   0 unlocked -> base art
//   1 unlocked -> that single genre     (goth / hard / kawaii / death)
//   2 unlocked -> that pair's fusion    (infixes joined by "-" in segment order)
//   3+ unlocked -> the "ultimate" look  (triples and the full four collapse here)
//
// The returned string is the sprite-filename infix: {id}.v2.{infix}.{mood}.png
// (empty string = base art, no infix).

import type { Segment } from "./types";

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
  goth: { name: "幽艶ゴシック", desc: "漆黒のレースと深紅を纏い、荘厳で物憂げなゴシック/シンフォニックの妖艶な姿へ。" },
  hard: { name: "鋼鉄ハードロック", desc: "革とスタッズ、王道の轟音。正統派ハードロックの風格ある姿へ。" },
  kawaii: { name: "紅黒カワメタ", desc: "黒と紅のフリルで可憐に暴れる、キュート×激烈のカワイイメタルの姿へ。" },
  death: { name: "戦鬼デスメタル", desc: "コープスペイントと鋲、戦装束。ウォー/デスメタルの獰猛な姿へ。" },
  // pairs
  "goth-hard": { name: "耽美ヘヴィ", desc: "ゴシックの妖艶と鋼鉄の重厚が融合、王道ゴシックメタルの姿へ。" },
  "goth-kawaii": { name: "幽艶ゴシックロリータ", desc: "闇の耽美と可憐が溶け合う、病みかわ耽美アイドルの姿へ。" },
  "goth-death": { name: "暗黒シンフォニック", desc: "荘厳な美と獰猛が交わる、シンフォニック・ブラック/デスの姿へ。" },
  "hard-kawaii": { name: "電撃アイドルメタル", desc: "轟音と可憐が弾ける、パワー系アイドルメタルの姿へ。" },
  "hard-death": { name: "漆黒スラッシュ", desc: "鋼鉄の疾走と死の獰猛が結び、ブラッケンド・スラッシュの姿へ。" },
  "kawaii-death": { name: "地獄カワメタ", desc: "可憐と残虐が同居する、デスコア・アイドルの姿へ。" },
  // ultimate (3 or 4 unlocked)
  ultimate: { name: "真・伝説", desc: "全ての客層を制した者だけが至る、究極の姿へ——！" },
};

/** Look name for the current unlocked set (for HUD / logs). "" if base. */
export const lookName = (unlocked: Record<string, boolean>): string =>
  EVO_LOOK[evolutionInfix(unlocked)]?.name ?? "";
