// Story scenes (紙芝居) for events. Live performances are narrated as VN-style
// scenes (background + standing characters + textbox), advanced with a 次へ
// button. Per-action flavor lives in flavor.ts; this file owns live shows and
// the training labels shown on the practice-choice screen.

import { pick } from "./flavor";
import type { GameState, LiveDecision, LiveResult, Param, Scene, SceneChar } from "./types";

interface Training {
  name: string; // what the session is called
  speaker: string; // who fires everyone up
  quote: string; // their line
  result: string; // flavor for the result panel
}

/** Per-parameter training flavor (used by the practice-choice screen). */
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

function venueBg(cap: number): "venueSmall" | "venueBig" {
  return cap >= 1000 ? "venueBig" : "venueSmall";
}

const ALL = ["RYO", "KEN", "MIO", "GO"] as const;
const ch = (member: string, pos: SceneChar["pos"], mood?: SceneChar["mood"]): SceneChar =>
  mood ? { member, pos, mood } : { member, pos };

/** Post-performance recap (the interactive MC/solo/encore live in the pre-show,
 *  see buildLivePreScenes). Shows the crowd, any trouble, and the climax. */
export function buildLiveScenes(
  _state: GameState,
  decision: LiveDecision,
  r: LiveResult,
  rng: () => number = Math.random,
): Scene[] {
  const bg = venueBg(decision.cap);
  const happy = r.satisfaction >= 60;
  const crowd = r.soldOut
    ? `客席は超満員！${r.draw}人が押し寄せ、SOLD OUT！`
    : `${r.draw}人が集まった（稼働率${Math.round(r.occupancy * 100)}%）。`;
  const climax =
    r.satisfaction >= 70
      ? "会場は総立ち、地鳴りのような大合唱！最高のライブだ！"
      : r.satisfaction >= 50
        ? "手応えは悪くない。確かな爪痕を残した。"
        : "盛り上がりは今ひとつ…次への課題が残った。";

  const scenes: Scene[] = [
    { bg, chars: [ch(pick(rng, ALL), "center", happy ? "fired" : "normal")], text: crowd },
  ];

  // Equipment trouble (low-intimacy PA): a member covers on the fly.
  if (r.trouble) {
    const saver = pick(rng, ALL);
    scenes.push({
      bg,
      chars: [ch(saver, "center", "sad")],
      speaker: saver,
      text: pick(rng, [
        "——機材トラブル！ 一瞬、音が飛ぶ。「……っ、繋げ！」なんとかその場をしのぐ。",
        "モニターから嫌なノイズ。ヒヤリとしたが、根性でリカバリーした。",
      ]),
    });
  }

  scenes.push({
    bg,
    chars: [ch(pick(rng, ALL), "center", happy ? "fired" : "sad")],
    text: climax,
    fx: happy ? "flash" : undefined,
  });
  scenes.push({
    bg,
    chars: [ch(pick(rng, ALL), "center", happy ? "happy" : "normal")],
    text: "ライブ終了——！ 手応えは数字に出たか…？",
  });

  return scenes;
}
