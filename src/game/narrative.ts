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
  // Suspense: the *rating* is revealed only on the result screen. These recap
  // beats stay neutral (attendance is fine to show — the player chose the venue).
  const crowd = r.soldOut
    ? `客席は超満員！${r.draw}人が押し寄せ、SOLD OUT！`
    : `${r.draw}人が詰めかけた（稼働率${Math.round(r.occupancy * 100)}%）。`;

  const scenes: Scene[] = [
    { bg, chars: [ch(pick(rng, ALL), "center", "fired")], text: crowd },
  ];

  // Equipment trouble (low-intimacy PA): a member covers on the fly.
  if (r.trouble) {
    const saver = pick(rng, ALL);
    scenes.push({
      bg,
      chars: [ch(saver, "center", "fired")],
      speaker: saver,
      text: pick(rng, [
        "——機材トラブル！ 一瞬、音が飛ぶ。「……っ、繋げ！」歯を食いしばって押し切る。",
        "モニターから嫌なノイズ。ヒヤリとしたが、根性で最後まで弾き切った。",
      ]),
    });
  }

  // Neutral, high-energy climax + a cliffhanger — no hint of the score.
  scenes.push({
    bg,
    chars: [ch(pick(rng, ALL), "center", "fired")],
    text: pick(rng, [
      "全てを出し切った——！ ４人の音が、会場の熱とひとつに混ざり合う。",
      "最後の一音を叩きつける。フロアの熱気が、天井までせり上がった。",
      "ラストナンバー、渾身の全力。汗が飛び、照明が弾ける。",
    ]),
    fx: "flash",
  });
  scenes.push({
    bg,
    chars: [ch(pick(rng, ALL), "center", "normal")],
    text: "ライブ終了——！ 今日の評価やいかに……！？",
  });

  return scenes;
}
