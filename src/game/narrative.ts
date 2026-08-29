// Story scenes (紙芝居) for events. Live performances are narrated as VN-style
// scenes (background + standing characters + textbox), advanced with a 次へ
// button. Per-action flavor lives in flavor.ts; this file owns live shows and
// the training labels shown on the practice-choice screen.

import { pick } from "./flavor";
import { L } from "./i18n";
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
    name: L("リズム＆基礎練", "Rhythm & Fundamentals"),
    speaker: "KEN",
    quote: L("おい、もっとBPMあげまくろうぜ！", "Yo, let's crank that BPM way up!"),
    result: L(
      "リズムが改善したかは分からないが、どんなテンポでも演奏できる気がする！",
      "Not sure my rhythm got any better, but I feel like I can play at any tempo now!",
    ),
  },
  P: {
    name: L("ステージング特訓", "Staging Bootcamp"),
    speaker: "RYO",
    quote: L("客を煽って巻き込め！もっと声出していけぇ！", "Work the crowd, drag 'em in! Louder, let's hear you!"),
    result: L(
      "汗だくになった。ステージでの暴れ方が板についてきた！",
      "Drenched in sweat. Going wild on stage is starting to feel natural!",
    ),
  },
  S: {
    name: L("作曲＆音楽理論", "Songwriting & Theory"),
    speaker: "KEN",
    quote: L("このリフ、もっと邪悪にできるだろ？", "This riff could get way more evil, right?"),
    result: L(
      "難解なコード進行をいくつもストックできた。世界観が深まった！",
      "Stockpiled a bunch of gnarly chord progressions. The vibe runs deeper now!",
    ),
  },
  V: {
    name: L("ビジュアル磨き", "Visual Polish"),
    speaker: "RYO",
    quote: L("衣装もメイクも限界までキメるぞ。", "We're taking the costumes and makeup all the way."),
    result: L(
      "鏡の前で決めポーズを研究した。ステージ映えが段違いだ！",
      "Practiced killer poses in the mirror. The stage presence is on another level!",
    ),
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
    ? L(`客席は超満員！${r.draw}人が押し寄せ、SOLD OUT！`, `The house is packed! ${r.draw} fans poured in — SOLD OUT!`)
    : L(
        `${r.draw}人が詰めかけた（稼働率${Math.round(r.occupancy * 100)}%）。`,
        `${r.draw} fans packed in (${Math.round(r.occupancy * 100)}% capacity).`,
      );

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
        L(
          "——機材トラブル！ 一瞬、音が飛ぶ。「……っ、繋げ！」歯を食いしばって押し切る。",
          "—Gear trouble! The sound cuts out for a second. \"...Keep it going!\" Teeth gritted, they push through.",
        ),
        L(
          "モニターから嫌なノイズ。ヒヤリとしたが、根性で最後まで弾き切った。",
          "A nasty noise blasts from the monitor. A scary moment, but sheer grit carried them to the last note.",
        ),
      ]),
    });
  }

  // Neutral, high-energy climax + a cliffhanger — no hint of the score.
  scenes.push({
    bg,
    chars: [ch(pick(rng, ALL), "center", "fired")],
    text: pick(rng, [
      L(
        "全てを出し切った——！ ４人の音が、会場の熱とひとつに混ざり合う。",
        "They left it all out there—! The four of them and the crowd's heat fuse into one.",
      ),
      L(
        "最後の一音を叩きつける。フロアの熱気が、天井までせり上がった。",
        "They slam down the final note. The heat on the floor surges all the way to the ceiling.",
      ),
      L(
        "ラストナンバー、渾身の全力。汗が飛び、照明が弾ける。",
        "The last number, everything they've got. Sweat flies, the lights explode.",
      ),
    ]),
    fx: "flash",
  });
  scenes.push({
    bg,
    chars: [ch(pick(rng, ALL), "center", "normal")],
    text: L("ライブ終了——！ 今日の評価やいかに……！？", "The show is over—! So, how did tonight rate...?!"),
  });

  return scenes;
}
