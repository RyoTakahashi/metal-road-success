// Story slides (紙芝居) for events. Practice and live performances are narrated
// as a sequence of illustrated panels advanced with a 次へ button.

import type { GameState, LiveDecision, LiveResult, Param, Slide } from "./types";
import { PARAM_LABEL } from "./types";

interface Training {
  name: string; // what the session is called
  art: string; // scene art for the practice
  speaker: string; // who fires everyone up
  quote: string; // their line
  result: string; // flavor for the result panel
}

/** Per-parameter training flavor. The chosen training raises that param. */
export const TRAININGS: Record<Param, Training> = {
  T: {
    name: "リズム＆基礎練",
    art: "🥁🎸🎶",
    speaker: "KEN",
    quote: "おい、もっとBPMあげまくろうぜ！",
    result: "リズムが改善したかは分からないが、どんなテンポでも演奏できる気がする！",
  },
  P: {
    name: "ステージング特訓",
    art: "🎤🔥🙌",
    speaker: "RYO",
    quote: "客を煽って巻き込め！もっと声出していけぇ！",
    result: "汗だくになった。ステージでの暴れ方が板についてきた！",
  },
  S: {
    name: "作曲＆音楽理論",
    art: "🎼🎧✍️",
    speaker: "KEN",
    quote: "このリフ、もっと邪悪にできるだろ？",
    result: "難解なコード進行をいくつもストックできた。世界観が深まった！",
  },
  V: {
    name: "ビジュアル磨き",
    art: "🖤💄🧥",
    speaker: "RYO",
    quote: "衣装もメイクも限界までキメるぞ。",
    result: "鏡の前で決めポーズを研究した。ステージ映えが段違いだ！",
  },
};

function intensity(mult: number): string {
  if (mult >= 5) return "魂を込めた猛特訓だ";
  if (mult <= 2) return "軽めのセッションになった";
  return "みっちり練習した";
}

/** Slides for a practice session on `param`, landed with dice `mult`, gain `gain`. */
export function buildPracticeSlides(param: Param, mult: number, gain: number): Slide[] {
  const t = TRAININGS[param];
  return [
    { art: t.art, text: `メンバー全員で集まり、${t.name}に取り組んだ。出目${mult}、${intensity(mult)}。` },
    { art: `🗣️🔥 ${t.speaker}`, text: `${t.quote}\n\nうぉぉぉぉぉおおおお！！`, speaker: t.speaker },
    { art: "✨💪✨", text: `${t.result}\n\n${PARAM_LABEL[param]} +${gain}！（全員）` },
  ];
}

function venueName(cap: number): string {
  if (cap <= 300) return "小箱ライブハウス";
  if (cap <= 600) return "ライブホール";
  return "大ホール";
}

const segWord: Record<LiveDecision["target"], string> = {
  core: "コアなメタラー",
  light: "ライトなロックファン",
  visual: "ビジュ目当ての観客",
  expert: "耳の肥えた玄人",
};

/** Slides depicting the live, referencing the actual result. */
export function buildLiveSlides(
  _state: GameState,
  decision: LiveDecision,
  r: LiveResult,
): Slide[] {
  const venue = venueName(decision.cap);
  const crowd = r.soldOut
    ? `客席は超満員！${r.draw}人が押し寄せ、SOLD OUT！`
    : `${r.draw}人が集まった（稼働率${Math.round(r.occupancy * 100)}%）。`;
  const climax =
    r.satisfaction >= 70
      ? "会場は総立ち、地鳴りのような大合唱！最高のライブだ！"
      : r.satisfaction >= 50
        ? "手応えは悪くない。確かな爪痕を残した。"
        : "盛り上がりは今ひとつ…次への課題が残った。";
  return [
    { art: "🎤🎸🥁", text: `開演前。${venue}のステージ袖で円陣を組む。「いくぞ——！」` },
    { art: "🚪👥🔥", text: crowd },
    { art: "🤘🎶🙌", text: `${segWord[decision.target]}に向けてぶちかます。フロアが揺れる。` },
    { art: "💥🔥💥", text: climax },
    { art: "🎆🙇✨", text: "ライブ終了——！ 手応えは数字に出たか…？" },
  ];
}
