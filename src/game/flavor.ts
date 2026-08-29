// Presentation variety (演出バリエーション). Mechanical outcomes live in
// state.ts / coreLoop.ts; this module only decides *how* a beat is shown —
// which member appears, their expression, and the flavor line — picking from
// pools so a repeated action never looks identical. No numbers are changed here.

import type { BgKey, Param, Scene, SceneChar } from "./types";
import { paramLabel } from "./types";

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

// Intro varies by what's being trained (音を鳴らす導入は演奏系だけ；ビジュ/センスは別).
const PRACTICE_INTRO: Record<Param, readonly string[]> = {
  T: [
    "スタジオに全員集合。メトロノームに合わせ、ひたすら反復で土台を固める。",
    "機材をセットして基礎練。走らず遅れず、リズムを体に叩き込む。",
    "「よし、やるか」——誰からともなく音を鳴らし始める。",
  ],
  P: [
    "鏡張りのスタジオでステージングの特訓。動き・煽り・魅せ方を反復する。",
    "本番さながらに立ち回りをシミュレート。客の巻き込み方を体に覚えさせる。",
    "声出しとアクション。ステージ度胸を鍛える一日だ。",
  ],
  S: [
    "曲作りとアレンジの研究。名盤を聴き込み、フレーズの引き出しを増やす。",
    "コード進行と理論をひたすら分解・再構築。感性を研ぎ澄ます。",
    "スタジオの隅で作曲ノートと睨めっこ。センスは地道に磨くものだ。",
  ],
  V: [
    "衣装合わせとメイク研究。鏡の前でステージ映えを徹底的に詰める。",
    "ヘアメイクとポージングをチェック。“魅せる自分”を作り込む。",
    "小物やアクセを取っ替え引っ替え。ビジュアルの完成度を上げていく。",
  ],
};

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
    mk("studio", lineup([...ALL]), pick(rng, PRACTICE_INTRO[param])),
    mk("studio", [c(coach.who, "center", "fired")], `${coach.quote}\n\nうぉぉぉぉぉおおおお！！`, {
      speaker: coach.who,
      fx: "shake",
    }),
    mk("studio", [c(reactor, "center", "happy")], `${pick(rng, PRACTICE_RESULT)} ${quip(rng, reactor)}\n\n${paramLabel(param)} +${gain}！（全員）`, {
      fx: "flash",
    }),
  ];
}

// --- アイテム入手（差し入れ・贈り物としてもらう演出）------------------------
// 「落ちてるものを拾う」のではなく、先輩バンド・音楽関係者・ファンからの
// 差し入れ／贈り物として受け取る。レア度で贈り主の格と盛り上がりが変わる。

const GIFT_B = [
  "対バンの先輩が「差し入れ、余ったからさ」と気さくに手渡してくれた。",
  "ライブ後、ファンの子がはにかみながらプレゼントを差し出してくれた。",
  "馴染みのハコの店長が「持ってきな」と、そっと何かをくれた。",
] as const;
const GIFT_A = [
  "対バンの大先輩がニヤリと笑って「これ、お前らに貸してやるよ」と差し出した。",
  "打ち上げで意気投合した音楽関係者が「見込みがあるね」と手土産をくれた。",
  "常連のファンが「どうしても渡したくて」と、特別な一品を持ってきてくれた。",
] as const;

// Drinks are handed over as an explicit 差し入れ (not "found").
const DRINK_IDS = new Set(["metalianD", "jackDaniels"]);
const GIFT_DRINK = [
  "対バンの先輩が「これ飲んで気合い入れてけ」と差し入れてくれた。",
  "ライブ後、常連のファンが「よかったら」とそっと差し入れてくれた。",
  "ハコの店長が「サービスだよ」と一本まわしてくれた。",
] as const;

/** Item gift production scaled to rarity (B: casual, A: notable, S: fanfare).
 *  `id` lets a few items (drinks) use bespoke 差し入れ flavor. */
export function itemFindScenes(tier: "S" | "A" | "B", name: string, effect: string, rng: Rng, id = ""): Scene[] {
  if (tier === "S") {
    const receiver = pick(rng, ALL);
    return [
      mk("backstage", lineup([...ALL], "normal"), pick(rng, [
        "楽屋の扉がゆっくり開く。現れたのは——伝説と噂される、あのバンドマン。",
        "熱狂的なファンから“とんでもない贈り物”が届いたと、楽屋がざわつく。",
      ]), { fx: "shake" }),
      mk("backstage", [c(receiver, "center", "fired")], `✨✨ 特別な贈り物！ ✨✨\n\n無言で差し出されたのは「${name}」——！！`, {
        speaker: receiver,
        fx: "flash",
      }),
      mk("backstage", lineup([...ALL], "happy"), `${effect}\n\nバンド全員、思わず雄叫びを上げた！`, { fx: "flash" }),
    ];
  }
  if (tier === "A") {
    const [receiver, mate] = sample(rng, ALL, 2);
    return [
      mk("street", [c(receiver, "center", "happy"), c(mate, "left", "normal")], pick(rng, GIFT_A), { fx: "shake" }),
      mk("street", [c(receiver, "center", "fired")], `★ レアな贈り物！\n\n「${name}」を受け取った。\n${effect}`, { fx: "flash" }),
    ];
  }
  // B — casual gift (drinks get a 差し入れ-specific line)
  const receiver = pick(rng, ALL);
  const line = DRINK_IDS.has(id) ? pick(rng, GIFT_DRINK) : pick(rng, GIFT_B);
  return [
    mk("street", [c(receiver, "center", "happy")], `🎁 ${line}\n\n「${name}」をもらった。\n${effect}`, { fx: "flash" }),
  ];
}

// --- アイテム使用（使ったときのちょっとした演出）----------------------------

/** Per-item use production. Falls back to a generic "used it" beat. */
export function itemUseScenes(id: string, name: string, effect: string, rng: Rng): Scene[] {
  const who = pick(rng, ALL);
  const one = (bg: BgKey, m: string, mood: Mood, text: string, fx: Scene["fx"], speaker?: string): Scene[] => [
    mk(bg, [c(m, "center", mood)], `${text}\n\n${effect}`, { fx, ...(speaker ? { speaker } : {}) }),
  ];
  switch (id) {
    case "metalianD":
      return one("backstage", who, "fired", "「ぷはーっ……！」メタリアンDを一気飲み。喉を焼く炭酸とともに、カッと目が冴えて力がみなぎる！", "flash", who);
    case "hellTraining":
      return one("studio", "KEN", "fired", "「地獄のメカニカルトレーニング」を開く。指がちぎれそうな反復フレーズ——極限の集中で特訓に没入する！", "shake", "KEN");
    case "jackDaniels":
      return one("backstage", who, "fired", "「飲まなきゃやってらんねぇ」——琥珀色を喉に流し込む。理性のリミッターが外れ、練習の鬼と化す。", "shake", who);
    case "studJacket":
      return one("street", who, "happy", "スタッズの付いた革ジャンに袖を通す。鏡の前で決めポーズ——うん、キマってる。", "flash", who);
    case "baaaan":
      return one("studio", who, "normal", "メタラーの愛読書「BAAAAN!!」をめくる。名リフの解説に、感性が刺激される。", "flash", who);
    case "silentGuitar":
    case "hyperMetronome":
      return one("studio", "KEN", "fired", `「${name}」を手に、時間の許す限り弾き込む。刻むほどに指が冴えていく。`, "shake", "KEN");
    case "boinKiller":
      return one("backstage", who, "happy", `「${name}」で英気を養う（？）。ともあれ、今夜はぐっすり眠れそうだ。`, "flash", who);
    case "batThing":
      return one("venueSmall", "RYO", "fired", "「例のコウモリ」を掲げる——本番、これで会場を狂乱の坩堝に叩き込む！", "shake", "RYO");
    case "starStrings":
      return one("studio", who, "fired", "「星の弦」に張り替える。弾いた瞬間、これは“満員”を呼ぶ音だと確信した。", "flash", who);
    case "whitePowder":
      return one("studio", who, "sad", "「白い粉」に手を伸ばす——すべてを差し出す覚悟で。降ってくる旋律と引き換えに、心身は削れていく。", "shake", who);
    case "metalGodProof":
      return [
        mk("venueBig", lineup([...ALL], "fired"), "「メタルゴッドの証」が輝きを放つ——空が裂け、天啓のごとき轟音がバンドを包む！", { fx: "shake" }),
        mk("venueBig", lineup([...ALL], "happy"), `全能力が覚醒し、ファンが爆発的に増えた！\n\n${effect}`, { fx: "flash" }),
      ];
    default:
      return one("studio", who, "happy", `「${name}」を使った。`, "flash");
  }
}
