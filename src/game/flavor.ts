// Presentation variety (演出バリエーション). Mechanical outcomes live in
// state.ts / coreLoop.ts; this module only decides *how* a beat is shown —
// which member appears, their expression, and the flavor line — picking from
// pools so a repeated action never looks identical. No numbers are changed here.

import type { BgKey, Param, Scene, SceneChar } from "./types";
import { PARAM_LABEL } from "./types";

type Mood = NonNullable<SceneChar["mood"]>;
type Rng = () => number;

/** Pick one element at random. */
export const pick = <T>(rng: Rng, arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];

/** Pick `n` distinct elements at random (or all, if fewer). */
export function sample<T>(rng: Rng, arr: readonly T[], n: number): T[] {
  const pool = [...arr];
  const out: T[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return out;
}

const ALL = ["RYO", "KEN", "MIO", "GO"] as const;
const c = (member: string, pos: SceneChar["pos"], mood?: Mood): SceneChar =>
  mood ? { member, pos, mood } : { member, pos };
const mk = (
  bg: BgKey,
  chars: SceneChar[],
  text: string,
  extra: { speaker?: string; fx?: Scene["fx"] } = {},
): Scene => ({ bg, chars, text, ...extra });

/** Line up 1–4 members across the stage (center-first, then left/right/edges). */
function lineup(members: string[], mood?: Mood): SceneChar[] {
  const slots: SceneChar["pos"][] = members.length <= 1 ? ["center"] : ["left", "center", "right", "left"];
  return members.map((m, i) => c(m, slots[i] ?? "center", mood));
}

/** In-character one-liners, reused across actions to color reactions. */
const QUIP: Record<string, readonly string[]> = {
  RYO: ["「フフ、悪くないじゃない」", "「あたしについてきな！」", "「客を沸かせてナンボでしょ」", "「まだ本気じゃないけどね」"],
  KEN: ["「まだだ、もっと詰められる」", "「この程度で満足すんなよ」", "「次はもっと速く、もっと邪悪に」", "「悪くない。だが完璧じゃない」"],
  MIO: ["「……悪くない」", "「ん、いい感じ」", "「…続けよ」", "「静かに燃えてる」"],
  GO: ["「うおー楽しいーっ！」", "「みんなサイコーッ！」", "「次いこ次っ！」", "「あたし、まだまだいけるよっ！」"],
};
const quip = (rng: Rng, m: string): string => pick(rng, QUIP[m] ?? [""]);

// --- Per-action scene pools -------------------------------------------------

/** 休息（完全休養 / 社会勉強 / 趣味）。resultText holds the stat line. */
export function restScenes(sub: string, resultText: string, rng: Rng): Scene[] {
  if (sub === "study") {
    const who = pick(rng, ALL);
    const line = pick(rng, [
      "図書館にこもって世の中を勉強した。歌詞の引き出しが増える。",
      "ニュースも小説も、片っ端から浴びるように読んだ。",
      "難しい話を、いつか刺さる歌詞のタネにする。",
    ]);
    return [mk("studio", [c(who, "center", "normal")], `${line}\n\n${resultText}`, { fx: "flash" })];
  }
  if (sub === "hobby") {
    const who = pick(rng, ALL);
    const line = pick(rng, [
      "好きなことに没頭してリフレッシュ。スタイルの幅も広がった。",
      "一日中、趣味に全振り。頭が空っぽになって逆に冴える。",
      "遊びのつもりが、気づけば次のステージ衣装のヒントに。",
    ]);
    return [mk("street", [c(who, "center", "happy")], `${line}\n\n${resultText}`, { fx: "flash" })];
  }
  // full rest
  const who = pick(rng, ALL);
  const line = pick(rng, [
    "今日はしっかり休養。泥のように眠って英気を養った。",
    "オフの日。だらだら過ごして、明日への活力を蓄える。",
    "湯船に浸かって、たまった疲れをぜんぶ流す。",
  ]);
  return [mk("backstage", [c(who, "center", "normal")], `${line}\n\n${resultText}`, { fx: "flash" })];
}

/** 作曲。 */
export function composeScenes(songName: string, Q: number, rng: Rng): Scene[] {
  const [a, b] = sample(rng, ALL, 2);
  const writer = pick(rng, ["KEN", "MIO"]); // 曲を持ってくるのは大抵この二人
  const spark = pick(rng, [
    "新しいリフが降ってきた。夜通しアレンジを詰める。",
    "スタジオの隅で鳴らした一音から、曲が転がり出す。",
    "「これだ」——閃きを逃さないうちに全員でカタチにする。",
  ]);
  const done = pick(rng, [
    `新曲「${songName}」が完成した！（Q${Q}）\n\n新曲はしばらく知名度とファンを引っぱってくれる。`,
    `ついに「${songName}」が形になった。（Q${Q}）\n\nしばらくは知名度とファンの伸びを支える一曲だ。`,
  ]);
  return [
    mk("studio", lineup([writer, writer === a ? b : a], "fired"), spark, { speaker: writer, fx: "shake" }),
    mk("studio", [c(pick(rng, ALL), "center", "happy")], done, { fx: "flash" }),
  ];
}

/** パフォーマンス（路上ゲリラ）。 */
export function performScenes(resultText: string, rng: Rng): Scene[] {
  const front = pick(rng, ["RYO", "GO"]);
  const line = pick(rng, [
    "路上でゲリラ演奏。足を止める人が、じわじわ人だかりに。",
    "駅前でいきなりの生演奏。ざわつく街に音をねじ込む。",
    "アンプ片手に路上ライブ。通行人が振り返り、輪ができる。",
  ]);
  return [mk("street", [c(front, "center", "fired")], `${line}\n\n${resultText}`, { speaker: front, fx: "shake" })];
}

/** 広報活動（SNS・宣伝）。 */
export function promoScenes(resultText: string, rng: Rng): Scene[] {
  const who = pick(rng, ALL);
  const line = pick(rng, [
    "SNSにライブ映像を投下。バズるかは運次第、でも撒かなきゃ始まらない。",
    "手描きのフライヤーを刷って街に貼って回る。地道が一番効く。",
    "深夜の生配信で新曲を弾き語り。少しずつ、確かに広がっていく。",
    "告知ポスト、連投。エゴサして反応を噛みしめる。",
  ]);
  return [mk("studio", [c(who, "center", "normal")], `${line}\n\n${resultText}`, { fx: "flash" })];
}

/** 新たな人脈。 */
export function contactScenes(resultText: string, rng: Rng): Scene[] {
  const who = pick(rng, ALL);
  const line = pick(rng, [
    "対バン相手やハコの店長と繋がった。人脈は将来サポート陣を招く鍵になる。",
    "打ち上げで隣り合った他バンドと意気投合。名刺代わりに音源を交換。",
    "顔なじみの店長に次を約束してもらえた。少しずつ地盤が固まる。",
  ]);
  return [mk("street", [c(who, "center", "happy")], `${line}\n\n${resultText}`, { fx: "flash" })];
}

/** バンド関係者との交流（結束）。 */
export function bondScenes(resultText: string, rng: Rng): Scene[] {
  const crew = sample(rng, ALL, 3 + Math.floor(rng() * 2)); // 3〜4人
  const line = pick(rng, [
    "全員で安居酒屋へ。本音をぶつけ合って、バンドの結束が高まる。",
    "スタジオ帰りにラーメン。くだらない話で笑い合う、こういう時間が効く。",
    "朝までカラオケ。喉は潰れたが、心の距離はぐっと縮まった。",
  ]);
  return [mk("backstage", lineup(crew, "happy"), `${line}\n\n${resultText}`, { fx: "flash" })];
}

/** アルバイト。 */
export function moneyScenes(resultText: string, rng: Rng): Scene[] {
  const who = pick(rng, ALL);
  const line = pick(rng, [
    "コンビニ夜勤でシフトを詰める。バンドは金がかかるのだ。",
    "引っ越しバイトで汗だく。稼いだ金はぜんぶ機材とスタジオ代へ。",
    "居酒屋ホールで愛想笑い。ライブの会場費は、こうやって貯める。",
  ]);
  return [mk("studio", [c(who, "center", "normal")], `${line}\n\n${resultText}`, { fx: "flash" })];
}

// --- 練習 -------------------------------------------------------------------

/** Coaches and their hype lines per trained param (rotated for variety). */
const COACH: Record<Param, { who: string; quote: string }[]> = {
  T: [
    { who: "KEN", quote: "「BPMあげてけ！走らず、遅れず、喰らいつけ！」" },
    { who: "MIO", quote: "「土台がブレたら全部崩れる。淡々といくよ」" },
    { who: "GO", quote: "「あたしのキック、置いてかないでねーっ！」" },
  ],
  P: [
    { who: "RYO", quote: "「客を煽って巻き込め！もっと声出していけぇ！」" },
    { who: "GO", quote: "「もっと跳ねて！ステージ狭く使うな〜！」" },
  ],
  S: [
    { who: "KEN", quote: "「このリフ、もっと邪悪にできるだろ？」" },
    { who: "MIO", quote: "「コードの隙間に、毒を仕込む」" },
  ],
  V: [
    { who: "RYO", quote: "「衣装もメイクも限界までキメるぞ」" },
    { who: "GO", quote: "「決めポーズ、いっせーのでっ！」" },
  ],
};

const PRACTICE_INTRO = [
  "スタジオに全員集合。今日はみっちり詰める日だ。",
  "機材をセットして、いざ特訓。時間の許す限り。",
  "「よし、やるか」——誰からともなく音を鳴らし始める。",
] as const;

const PRACTICE_RESULT = [
  "手応えあり。体に染み込んだ感覚がある。",
  "汗だくになったが、確かに一段うまくなった気がする。",
  "地味だが、こういう積み重ねが本番で効いてくる。",
] as const;

/** 練習。Coach, banter and reactions vary; the numbers come from state.ts. */
export function practiceScenes(param: Param, gain: number, rng: Rng): Scene[] {
  const coach = pick(rng, COACH[param]);
  const cheer = ALL.filter((m) => m !== coach.who);
  const reactor = pick(rng, cheer);
  return [
    mk("studio", lineup([...ALL]), pick(rng, PRACTICE_INTRO)),
    mk("studio", [c(coach.who, "center", "fired")], `${coach.quote}\n\nうぉぉぉぉぉおおおお！！`, {
      speaker: coach.who,
      fx: "shake",
    }),
    mk("studio", [c(reactor, "center", "happy")], `${pick(rng, PRACTICE_RESULT)} ${quip(rng, reactor)}\n\n${PARAM_LABEL[param]} +${gain}！（全員）`, {
      fx: "flash",
    }),
  ];
}

// --- アイテム発見（レア度で演出を変える）------------------------------------

/** Item-find production scaled to rarity (B: casual, A: rare, S: fanfare). */
export function itemFindScenes(tier: "S" | "A" | "B", name: string, effect: string, rng: Rng): Scene[] {
  if (tier === "S") {
    const finder = pick(rng, ALL);
    return [
      mk("backstage", lineup([...ALL], "fired"), pick(rng, [
        "空気が変わった。何か、とんでもないモノの気配……！",
        "スタジオの照明がチカッと明滅する。これは……ただ事じゃない。",
      ]), { fx: "shake" }),
      mk("backstage", [c(finder, "center", "fired")], `✨✨ 伝説級のアイテム発見！ ✨✨\n\n「${name}」——！！`, {
        speaker: finder,
        fx: "flash",
      }),
      mk("backstage", lineup([...ALL], "happy"), `${effect}\n\nバンド全員、雄叫びを上げた！`, { fx: "flash" }),
    ];
  }
  if (tier === "A") {
    const [finder, mate] = sample(rng, ALL, 2);
    return [
      mk("street", [c(finder, "center", "happy"), c(mate, "left", "normal")], pick(rng, [
        "「ちょっと待って、これ……レアなやつじゃない！？」",
        "「うわ、当たりだ。こんなの滅多に出ないぞ」",
      ]), { speaker: finder, fx: "shake" }),
      mk("street", [c(finder, "center", "fired")], `★ レアアイテム発見！\n\n「${name}」を手に入れた。\n${effect}`, { fx: "flash" }),
    ];
  }
  // B — casual find
  const finder = pick(rng, ALL);
  return [
    mk("street", [c(finder, "center", "normal")], `${pick(rng, [
      "🎁 お、なんか落ちてる。",
      "🎁 帰り道、思わぬ拾いものだ。",
      "🎁 差し入れ？ とにかくアイテムを見つけた。",
    ])}\n\n「${name}」を手に入れた。\n${effect}`, { fx: "flash" }),
  ];
}
