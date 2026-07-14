// Story scenes (紙芝居) for events. Practice and live performances are narrated
// as VN-style scenes (background + standing characters + textbox), advanced with
// a 次へ button.

import type { GameState, LiveDecision, LiveResult, Param, Scene } from "./types";
import { PARAM_LABEL } from "./types";

interface Training {
  name: string; // what the session is called
  speaker: string; // who fires everyone up
  quote: string; // their line
  result: string; // flavor for the result panel
}

/** Per-parameter training flavor. The chosen training raises that param. */
export const TRAININGS: Record<Param, Training> = {
  T: {
    name: "リズム＆基礎練",
    speaker: "KEN",
    quote: "おい、もっとBPMあげまくろうぜ！",
    result: "リズムが改善したかは分からないが、どんなテンポでも演奏できる気がする！",
  },
  P: {
    name: "ステージング特訓",
    speaker: "RYO",
    quote: "客を煽って巻き込め！もっと声出していけぇ！",
    result: "汗だくになった。ステージでの暴れ方が板についてきた！",
  },
  S: {
    name: "作曲＆音楽理論",
    speaker: "KEN",
    quote: "このリフ、もっと邪悪にできるだろ？",
    result: "難解なコード進行をいくつもストックできた。世界観が深まった！",
  },
  V: {
    name: "ビジュアル磨き",
    speaker: "RYO",
    quote: "衣装もメイクも限界までキメるぞ。",
    result: "鏡の前で決めポーズを研究した。ステージ映えが段違いだ！",
  },
};

/** Scenes for a practice session on `param` with total `gain`. */
export function buildPracticeScenes(param: Param, gain: number): Scene[] {
  const t = TRAININGS[param];
  return [
    {
      bg: "studio",
      chars: [
        { member: "KEN", pos: "left" },
        { member: "RYO", pos: "center" },
        { member: "MIO", pos: "center" },
        { member: "GO", pos: "right" },
      ],
      text: `メンバー全員で集まり、${t.name}にみっちり取り組んだ。`,
    },
    {
      bg: "studio",
      chars: [{ member: t.speaker, pos: "center", mood: "fired" }],
      speaker: t.speaker,
      text: `${t.quote}\n\nうぉぉぉぉぉおおおお！！`,
      fx: "shake",
    },
    {
      bg: "studio",
      chars: [{ member: t.speaker, pos: "center", mood: "happy" }],
      text: `${t.result}\n\n${PARAM_LABEL[param]} +${gain}！（全員）`,
      fx: "flash",
    },
  ];
}

function venueBg(cap: number): "venueSmall" | "venueBig" {
  return cap >= 1000 ? "venueBig" : "venueSmall";
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

/** Scenes depicting the live, referencing the actual result. */
export function buildLiveScenes(
  _state: GameState,
  decision: LiveDecision,
  r: LiveResult,
): Scene[] {
  const bg = venueBg(decision.cap);
  const crowd = r.soldOut
    ? `客席は超満員！${r.draw}人が押し寄せ、SOLD OUT！`
    : `${r.draw}人が集まった（稼働率${Math.round(r.occupancy * 100)}%）。`;
  const happy = r.satisfaction >= 60;
  const climax =
    r.satisfaction >= 70
      ? "会場は総立ち、地鳴りのような大合唱！最高のライブだ！"
      : r.satisfaction >= 50
        ? "手応えは悪くない。確かな爪痕を残した。"
        : "盛り上がりは今ひとつ…次への課題が残った。";
  return [
    {
      bg: "backstage",
      chars: [
        { member: "RYO", pos: "left" },
        { member: "GO", pos: "right" },
      ],
      speaker: "RYO",
      text: `開演前。${venueName(decision.cap)}のステージ袖で円陣を組む。「いくぞ——！」`,
    },
    { bg, chars: [{ member: "RYO", pos: "center" }], text: crowd },
    {
      bg,
      chars: [
        { member: "KEN", pos: "left", mood: "fired" },
        { member: "RYO", pos: "center", mood: "fired" },
      ],
      text: `${segWord[decision.target]}に向けてぶちかます。フロアが揺れる。`,
      fx: "shake",
    },
    {
      bg,
      chars: [{ member: "RYO", pos: "center", mood: happy ? "fired" : "sad" }],
      text: climax,
      fx: happy ? "flash" : undefined,
    },
    {
      bg,
      chars: [{ member: "RYO", pos: "center", mood: happy ? "happy" : "normal" }],
      text: "ライブ終了——！ 手応えは数字に出たか…？",
    },
  ];
}
