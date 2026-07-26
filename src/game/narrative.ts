// Story scenes (紙芝居) for events. Live performances are narrated as VN-style
// scenes (background + standing characters + textbox), advanced with a 次へ
// button. Per-action flavor lives in flavor.ts; this file owns live shows and
// the training labels shown on the practice-choice screen.

import { pick, sample } from "./flavor";
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

const ALL = ["RYO", "KEN", "MIO", "GO"] as const;
const ch = (member: string, pos: SceneChar["pos"], mood?: SceneChar["mood"]): SceneChar =>
  mood ? { member, pos, mood } : { member, pos };

/** Instrument spotlight line per member (used mid-set). */
const SOLO: Record<string, string> = {
  RYO: "RYOのシャウトが会場を切り裂く！フロア全体が咆哮で応える。",
  KEN: "KENの指が弦の上を疾走。唸るギターソロにフロアが沸騰する！",
  MIO: "MIOの地を這うベースが腹の底を揺らす。静かに、確実に空気を掌握する。",
  GO: "GOの手数の暴力！刻むビートが加速し、熱狂が渦を巻く。",
};

const HUDDLE = [
  "円陣を組む。「いくぞ——！」",
  "肩を組んで気合を入れる。「今日、全部ぶつけるよ」",
  "拳を突き合わせる。「最高の夜にしよう」",
] as const;

/** Scenes depicting the live, referencing the actual result. Variety in the
 *  huddle members, the instrument spotlight, trouble and encore beats. */
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

  // Huddle: two random members backstage.
  const [h1, h2] = sample(rng, ALL, 2);
  // Spotlight: one or two random members take the solo.
  const soloists = sample(rng, ALL, 1 + Math.floor(rng() * 2));

  const scenes: Scene[] = [
    {
      bg: "backstage",
      chars: [ch(h1, "left", "fired"), ch(h2, "right", "normal")],
      speaker: h1,
      text: `開演前。${venueName(decision.cap)}のステージ袖。${pick(rng, HUDDLE)}`,
    },
    { bg, chars: [ch(pick(rng, ALL), "center", happy ? "fired" : "normal")], text: crowd },
    {
      bg,
      chars: soloists.map((m, i) => ch(m, i === 0 ? "center" : "left", "fired")),
      text: `${segWord[decision.target]}に向けてぶちかます。${soloists.map((m) => SOLO[m]).join("\n")}`,
      fx: "shake",
    },
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

  // Encore on a great show.
  if (r.satisfaction >= 75) {
    scenes.push({
      bg,
      chars: [ch("RYO", "left", "happy"), ch("KEN", "center", "fired"), ch("GO", "right", "happy")],
      text: "鳴り止まぬ「アンコール！」の大合唱。もう一曲、最高の一夜に応える——！",
      fx: "flash",
    });
  }

  scenes.push({
    bg,
    chars: [ch(pick(rng, ALL), "center", happy ? "happy" : "normal")],
    text: "ライブ終了——！ 手応えは数字に出たか…？",
  });

  return scenes;
}
