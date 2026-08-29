// Presentation variety (演出バリエーション). Mechanical outcomes live in
// state.ts / coreLoop.ts; this module only decides *how* a beat is shown —
// which member appears, their expression, and the flavor line — picking from
// pools so a repeated action never looks identical. No numbers are changed here.

import type { BgKey, Param, Scene, SceneChar } from "./types";
import { paramLabel } from "./types";
import { L } from "./i18n";

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
  RYO: [L("「フフ、悪くないじゃない」", '"Heh, not bad at all."'), L("「あたしについてきな！」", '"Just follow my lead!"'), L("「客を沸かせてナンボでしょ」", '"It\'s all about firing up the crowd."'), L("「まだ本気じゃないけどね」", '"Not even going full-throttle yet, though."')],
  KEN: [L("「まだだ、もっと詰められる」", '"Not yet. We can tighten this up more."'), L("「この程度で満足すんなよ」", '"Don\'t you dare settle for this."'), L("「次はもっと速く、もっと邪悪に」", '"Next time, faster and more evil."'), L("「悪くない。だが完璧じゃない」", '"Not bad. But not perfect."')],
  MIO: [L("「……悪くない」", '"...Not bad."'), L("「ん、いい感じ」", '"Mm, feels good."'), L("「…続けよ」", '"...Keep going."'), L("「静かに燃えてる」", '"Quietly on fire."')],
  GO: [L("「うおー楽しいーっ！」", '"Whoa, this is so much fun!"'), L("「みんなサイコーッ！」", '"You guys are the best!"'), L("「次いこ次っ！」", '"Next one, next one!"'), L("「あたし、まだまだいけるよっ！」", '"I\'ve still got way more in me!"')],
};
const quip = (rng: Rng, m: string): string => pick(rng, QUIP[m] ?? [""]);

// --- Per-action scene pools -------------------------------------------------

/** 休息（完全休養 / 社会勉強 / 趣味）。resultText holds the stat line. */
export function restScenes(sub: string, resultText: string, rng: Rng): Scene[] {
  if (sub === "study") {
    const who = pick(rng, ALL);
    const line = pick(rng, [
      L("図書館にこもって世の中を勉強した。歌詞の引き出しが増える。", "Holed up in the library studying the world. More material for lyrics."),
      L("ニュースも小説も、片っ端から浴びるように読んだ。", "News, novels, whatever — devoured it all, one after another."),
      L("難しい話を、いつか刺さる歌詞のタネにする。", "Turning heavy topics into seeds for lyrics that'll one day hit home."),
    ]);
    return [mk("studio", [c(who, "center", "normal")], `${line}\n\n${resultText}`, { fx: "flash" })];
  }
  if (sub === "hobby") {
    const who = pick(rng, ALL);
    const line = pick(rng, [
      L("好きなことに没頭してリフレッシュ。スタイルの幅も広がった。", "Lost myself in a hobby to recharge. Broadened my style, too."),
      L("一日中、趣味に全振り。頭が空っぽになって逆に冴える。", "All day on a hobby. Emptied my head, and somehow it sharpened me up."),
      L("遊びのつもりが、気づけば次のステージ衣装のヒントに。", "Meant to just goof off, but it turned into ideas for the next stage outfit."),
    ]);
    return [mk("street", [c(who, "center", "happy")], `${line}\n\n${resultText}`, { fx: "flash" })];
  }
  // full rest
  const who = pick(rng, ALL);
  const line = pick(rng, [
    L("今日はしっかり休養。泥のように眠って英気を養った。", "A proper day off. Slept like a log and got the energy back."),
    L("オフの日。だらだら過ごして、明日への活力を蓄える。", "Day off. Lazed around and stored up energy for tomorrow."),
    L("湯船に浸かって、たまった疲れをぜんぶ流す。", "Soaked in a hot bath and washed away all the built-up fatigue."),
  ]);
  return [mk("backstage", [c(who, "center", "normal")], `${line}\n\n${resultText}`, { fx: "flash" })];
}

/** 作曲。 */
export function composeScenes(songName: string, Q: number, rng: Rng): Scene[] {
  const [a, b] = sample(rng, ALL, 2);
  const writer = pick(rng, ["KEN", "MIO"]); // 曲を持ってくるのは大抵この二人
  const spark = pick(rng, [
    L("新しいリフが降ってきた。夜通しアレンジを詰める。", "A new riff just came to me. Pulling an all-nighter to nail the arrangement."),
    L("スタジオの隅で鳴らした一音から、曲が転がり出す。", "One note struck in the corner of the studio, and a whole song starts rolling out."),
    L("「これだ」——閃きを逃さないうちに全員でカタチにする。", '"This is it." — the whole band shapes it up before the spark slips away.'),
  ]);
  const done = pick(rng, [
    L(`新曲「${songName}」が完成した！（Q${Q}）\n\n新曲はしばらく知名度とファンを引っぱってくれる。`, `New song "${songName}" is complete! (Q${Q})\n\nA fresh track will drive fame and fans for a while.`),
    L(`ついに「${songName}」が形になった。（Q${Q}）\n\nしばらくは知名度とファンの伸びを支える一曲だ。`, `"${songName}" has finally taken shape. (Q${Q})\n\nA track that'll fuel fame and fan growth for a while.`),
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
    L("路上でゲリラ演奏。足を止める人が、じわじわ人だかりに。", "A guerrilla set out on the street. People stop, and slowly a crowd forms."),
    L("駅前でいきなりの生演奏。ざわつく街に音をねじ込む。", "A sudden live show by the station. Cramming our sound into the buzzing streets."),
    L("アンプ片手に路上ライブ。通行人が振り返り、輪ができる。", "Street gig, amp in hand. Passersby turn to look, and a ring gathers."),
  ]);
  return [mk("street", [c(front, "center", "fired")], `${line}\n\n${resultText}`, { speaker: front, fx: "shake" })];
}

/** 広報活動（SNS・宣伝）。 */
export function promoScenes(resultText: string, rng: Rng): Scene[] {
  const who = pick(rng, ALL);
  const line = pick(rng, [
    L("SNSにライブ映像を投下。バズるかは運次第、でも撒かなきゃ始まらない。", "Dropped live footage on social. Whether it goes viral is luck, but you gotta put it out there."),
    L("手描きのフライヤーを刷って街に貼って回る。地道が一番効く。", "Printed hand-drawn flyers and plastered them around town. Grinding it out works best."),
    L("深夜の生配信で新曲を弾き語り。少しずつ、確かに広がっていく。", "Late-night livestream, playing the new song solo. Slowly but surely, the word spreads."),
    L("告知ポスト、連投。エゴサして反応を噛みしめる。", "Spammed the announcement posts. Then vanity-searched and savored every reaction."),
  ]);
  return [mk("studio", [c(who, "center", "normal")], `${line}\n\n${resultText}`, { fx: "flash" })];
}

/** 新たな人脈。 */
export function contactScenes(resultText: string, rng: Rng): Scene[] {
  const who = pick(rng, ALL);
  const line = pick(rng, [
    L("対バン相手やハコの店長と繋がった。人脈は将来サポート陣を招く鍵になる。", "Connected with fellow acts and venue owners. Contacts are the key to landing support crew down the line."),
    L("打ち上げで隣り合った他バンドと意気投合。名刺代わりに音源を交換。", "Hit it off with another band at the after-party. Swapped tracks instead of business cards."),
    L("顔なじみの店長に次を約束してもらえた。少しずつ地盤が固まる。", "A familiar venue owner promised us a next gig. The groundwork is slowly firming up."),
  ]);
  return [mk("street", [c(who, "center", "happy")], `${line}\n\n${resultText}`, { fx: "flash" })];
}

/** バンド関係者との交流（結束）。 */
export function bondScenes(resultText: string, rng: Rng): Scene[] {
  const crew = sample(rng, ALL, 3 + Math.floor(rng() * 2)); // 3〜4人
  const line = pick(rng, [
    L("全員で安居酒屋へ。本音をぶつけ合って、バンドの結束が高まる。", "The whole band hit a cheap bar. Hashing out what we really feel, the band's unity grows."),
    L("スタジオ帰りにラーメン。くだらない話で笑い合う、こういう時間が効く。", "Ramen on the way back from the studio. Laughing over dumb stories — this kind of time matters."),
    L("朝までカラオケ。喉は潰れたが、心の距離はぐっと縮まった。", "Karaoke till dawn. Our throats are wrecked, but we're a whole lot closer."),
  ]);
  return [mk("backstage", lineup(crew, "happy"), `${line}\n\n${resultText}`, { fx: "flash" })];
}

/** アルバイト。 */
export function moneyScenes(resultText: string, rng: Rng): Scene[] {
  const who = pick(rng, ALL);
  const line = pick(rng, [
    L("コンビニ夜勤でシフトを詰める。バンドは金がかかるのだ。", "Packing in night shifts at the convenience store. A band costs money, after all."),
    L("引っ越しバイトで汗だく。稼いだ金はぜんぶ機材とスタジオ代へ。", "Sweating it out on a moving-crew gig. Every yen earned goes to gear and studio fees."),
    L("居酒屋ホールで愛想笑い。ライブの会場費は、こうやって貯める。", "Forcing a smile waiting tables at the izakaya. This is how you save up for venue fees."),
  ]);
  return [mk("studio", [c(who, "center", "normal")], `${line}\n\n${resultText}`, { fx: "flash" })];
}

// --- 練習 -------------------------------------------------------------------

/** Coaches and their hype lines per trained param (rotated for variety). */
const COACH: Record<Param, { who: string; quote: string }[]> = {
  T: [
    { who: "KEN", quote: L("「BPMあげてけ！走らず、遅れず、喰らいつけ！」", '"Push the BPM! Don\'t rush, don\'t drag, hang on tight!"') },
    { who: "MIO", quote: L("「土台がブレたら全部崩れる。淡々といくよ」", '"If the foundation wobbles, it all falls apart. Nice and steady."') },
    { who: "GO", quote: L("「あたしのキック、置いてかないでねーっ！」", '"Don\'t leave my kick drum behind!"') },
  ],
  P: [
    { who: "RYO", quote: L("「客を煽って巻き込め！もっと声出していけぇ！」", '"Work the crowd, pull them in! Give me more voice!"') },
    { who: "GO", quote: L("「もっと跳ねて！ステージ狭く使うな〜！」", '"Jump higher! Don\'t play the stage so small!"') },
  ],
  S: [
    { who: "KEN", quote: L("「このリフ、もっと邪悪にできるだろ？」", '"This riff — we can make it way more evil, right?"') },
    { who: "MIO", quote: L("「コードの隙間に、毒を仕込む」", '"Slipping poison into the gaps between the chords."') },
  ],
  V: [
    { who: "RYO", quote: L("「衣装もメイクも限界までキメるぞ」", '"We\'re nailing the outfits and makeup to the absolute limit."') },
    { who: "GO", quote: L("「決めポーズ、いっせーのでっ！」", '"Signature pose — on the count of one!"') },
  ],
};

// Intro varies by what's being trained (音を鳴らす導入は演奏系だけ；ビジュ/センスは別).
const PRACTICE_INTRO: Record<Param, readonly string[]> = {
  T: [
    L("スタジオに全員集合。メトロノームに合わせ、ひたすら反復で土台を固める。", "Whole band in the studio. Locked to the metronome, drilling the fundamentals over and over."),
    L("機材をセットして基礎練。走らず遅れず、リズムを体に叩き込む。", "Set up the gear for basics. Don't rush, don't drag — pounding the rhythm into your body."),
    L("「よし、やるか」——誰からともなく音を鳴らし始める。", '"Alright, let\'s do this." — and without a cue, someone starts playing.'),
  ],
  P: [
    L("鏡張りのスタジオでステージングの特訓。動き・煽り・魅せ方を反復する。", "Staging drills in the mirror-lined studio. Movement, hyping the crowd, showmanship — over and over."),
    L("本番さながらに立ち回りをシミュレート。客の巻き込み方を体に覚えさせる。", "Simulating the show for real. Drilling how to pull the crowd in until it's second nature."),
    L("声出しとアクション。ステージ度胸を鍛える一日だ。", "Vocals and stage moves. A day for building nerves of steel on stage."),
  ],
  S: [
    L("曲作りとアレンジの研究。名盤を聴き込み、フレーズの引き出しを増やす。", "Studying songwriting and arrangement. Soaking in classic albums, stocking up on phrases."),
    L("コード進行と理論をひたすら分解・再構築。感性を研ぎ澄ます。", "Breaking down and rebuilding chord progressions and theory endlessly. Sharpening the instincts."),
    L("スタジオの隅で作曲ノートと睨めっこ。センスは地道に磨くものだ。", "Staring down the songwriting notebook in the corner of the studio. Songcraft is honed the hard way."),
  ],
  V: [
    L("衣装合わせとメイク研究。鏡の前でステージ映えを徹底的に詰める。", "Costume fitting and makeup study. Perfecting stage presence in front of the mirror."),
    L("ヘアメイクとポージングをチェック。“魅せる自分”を作り込む。", 'Checking hair, makeup, and posing. Crafting the "you" that commands attention.'),
    L("小物やアクセを取っ替え引っ替え。ビジュアルの完成度を上げていく。", "Swapping accessories in and out. Dialing up the visual to perfection."),
  ],
};

const PRACTICE_RESULT = [
  L("手応えあり。体に染み込んだ感覚がある。", "Real progress. You can feel it sinking into your body."),
  L("汗だくになったが、確かに一段うまくなった気がする。", "Drenched in sweat, but definitely a notch better."),
  L("地味だが、こういう積み重ねが本番で効いてくる。", "Unglamorous, but this kind of grind is what pays off on stage."),
] as const;

/** 練習。Coach, banter and reactions vary; the numbers come from state.ts. */
export function practiceScenes(param: Param, gain: number, rng: Rng): Scene[] {
  const coach = pick(rng, COACH[param]);
  const cheer = ALL.filter((m) => m !== coach.who);
  const reactor = pick(rng, cheer);
  return [
    mk("studio", lineup([...ALL]), pick(rng, PRACTICE_INTRO[param])),
    mk("studio", [c(coach.who, "center", "fired")], L(`${coach.quote}\n\nうぉぉぉぉぉおおおお！！`, `${coach.quote}\n\nWOAAAAAHHHH!!`), {
      speaker: coach.who,
      fx: "shake",
    }),
    mk("studio", [c(reactor, "center", "happy")], L(`${pick(rng, PRACTICE_RESULT)} ${quip(rng, reactor)}\n\n${paramLabel(param)} +${gain}！（全員）`, `${pick(rng, PRACTICE_RESULT)} ${quip(rng, reactor)}\n\n${paramLabel(param)} +${gain}! (all members)`), {
      fx: "flash",
    }),
  ];
}

// --- アイテム入手（差し入れ・贈り物としてもらう演出）------------------------
// 「落ちてるものを拾う」のではなく、先輩バンド・音楽関係者・ファンからの
// 差し入れ／贈り物として受け取る。レア度で贈り主の格と盛り上がりが変わる。

const GIFT_B = [
  L("対バンの先輩が「差し入れ、余ったからさ」と気さくに手渡してくれた。", 'A senior act from the bill handed it over casually — "Had some extra, here you go."'),
  L("ライブ後、ファンの子がはにかみながらプレゼントを差し出してくれた。", "After the show, a shy fan held out a present."),
  L("馴染みのハコの店長が「持ってきな」と、そっと何かをくれた。", 'The venue owner we know slipped us something — "Take it."'),
] as const;
const GIFT_A = [
  L("対バンの大先輩がニヤリと笑って「これ、お前らに貸してやるよ」と差し出した。", 'A big-name veteran from the bill grinned and held it out — "I\'ll lend this to you kids."'),
  L("打ち上げで意気投合した音楽関係者が「見込みがあるね」と手土産をくれた。", 'A music-industry contact we clicked with at the after-party gave us a gift — "You\'ve got potential."'),
  L("常連のファンが「どうしても渡したくて」と、特別な一品を持ってきてくれた。", 'A regular fan brought us something special — "I just had to give you this."'),
] as const;

// Drinks are handed over as an explicit 差し入れ (not "found").
const DRINK_IDS = new Set(["metalianD", "jackDaniels"]);
const GIFT_DRINK = [
  L("対バンの先輩が「これ飲んで気合い入れてけ」と差し入れてくれた。", 'A senior act from the bill passed one over — "Drink this and get pumped."'),
  L("ライブ後、常連のファンが「よかったら」とそっと差し入れてくれた。", 'After the show, a regular fan quietly offered one — "If you\'d like."'),
  L("ハコの店長が「サービスだよ」と一本まわしてくれた。", 'The venue owner slid us one — "On the house."'),
] as const;

/** Item gift production scaled to rarity (B: casual, A: notable, S: fanfare).
 *  `id` lets a few items (drinks) use bespoke 差し入れ flavor. */
export function itemFindScenes(tier: "S" | "A" | "B", name: string, effect: string, rng: Rng, id = ""): Scene[] {
  if (tier === "S") {
    const receiver = pick(rng, ALL);
    return [
      mk("backstage", lineup([...ALL], "normal"), pick(rng, [
        L("楽屋の扉がゆっくり開く。現れたのは——伝説と噂される、あのバンドマン。", "The greenroom door swings slowly open. In steps — that musician, the one they call a legend."),
        L("熱狂的なファンから“とんでもない贈り物”が届いたと、楽屋がざわつく。", 'Word spreads through the greenroom: a diehard fan has sent "an outrageous gift."'),
      ]), { fx: "shake" }),
      mk("backstage", [c(receiver, "center", "fired")], L(`✨✨ 特別な贈り物！ ✨✨\n\n無言で差し出されたのは「${name}」——！！`, `✨✨ A special gift! ✨✨\n\nWordlessly held out to us: "${name}" —!!`), {
        speaker: receiver,
        fx: "flash",
      }),
      mk("backstage", lineup([...ALL], "happy"), L(`${effect}\n\nバンド全員、思わず雄叫びを上げた！`, `${effect}\n\nThe whole band let out a war cry!`), { fx: "flash" }),
    ];
  }
  if (tier === "A") {
    const [receiver, mate] = sample(rng, ALL, 2);
    return [
      mk("street", [c(receiver, "center", "happy"), c(mate, "left", "normal")], pick(rng, GIFT_A), { fx: "shake" }),
      mk("street", [c(receiver, "center", "fired")], L(`★ レアな贈り物！\n\n「${name}」を受け取った。\n${effect}`, `★ A rare gift!\n\nReceived "${name}".\n${effect}`), { fx: "flash" }),
    ];
  }
  // B — casual gift (drinks get a 差し入れ-specific line)
  const receiver = pick(rng, ALL);
  const line = DRINK_IDS.has(id) ? pick(rng, GIFT_DRINK) : pick(rng, GIFT_B);
  return [
    mk("street", [c(receiver, "center", "happy")], L(`🎁 ${line}\n\n「${name}」をもらった。\n${effect}`, `🎁 ${line}\n\nGot "${name}".\n${effect}`), { fx: "flash" }),
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
      return one("backstage", who, "fired", L("「ぷはーっ……！」メタリアンDを一気飲み。喉を焼く炭酸とともに、カッと目が冴えて力がみなぎる！", '"Pwahh...!" Chugged a Metalian-D in one go. The throat-searing fizz snaps you wide awake and floods you with power!'), "flash", who);
    case "hellTraining":
      return one("studio", "KEN", "fired", L("「地獄のメカニカルトレーニング」を開く。指がちぎれそうな反復フレーズ——極限の集中で特訓に没入する！", 'Cracks open "Hellish Mechanical Training." Finger-shredding repetitive phrases — diving into practice with extreme focus!'), "shake", "KEN");
    case "jackDaniels":
      return one("backstage", who, "fired", L("「飲まなきゃやってらんねぇ」——琥珀色を喉に流し込む。理性のリミッターが外れ、練習の鬼と化す。", '"Can\'t do this sober." — pours the amber down the throat. The limiter on reason comes off, and turns into a practice demon.'), "shake", who);
    case "studJacket":
      return one("street", who, "happy", L("スタッズの付いた革ジャンに袖を通す。鏡の前で決めポーズ——うん、キマってる。", "Slips into the studded leather jacket. Strikes a pose in the mirror — yeah, looking sharp."), "flash", who);
    case "baaaan":
      return one("studio", who, "normal", L("メタラーの愛読書「BAAAAN!!」をめくる。名リフの解説に、感性が刺激される。", 'Flips through "BAAAAN!!", every metalhead\'s favorite read. The breakdowns of classic riffs spark the songcraft.'), "flash", who);
    case "silentGuitar":
    case "hyperMetronome":
      return one("studio", "KEN", "fired", L(`「${name}」を手に、時間の許す限り弾き込む。刻むほどに指が冴えていく。`, `"${name}" in hand, playing until time runs out. The more you grind, the sharper the fingers get.`), "shake", "KEN");
    case "boinKiller":
      return one("backstage", who, "happy", L(`「${name}」で英気を養う（？）。ともあれ、今夜はぐっすり眠れそうだ。`, `Recharging (?) with "${name}". Either way, looks like a good night's sleep tonight.`), "flash", who);
    case "batThing":
      return one("venueSmall", "RYO", "fired", L("「例のコウモリ」を掲げる——本番、これで会場を狂乱の坩堝に叩き込む！", 'Holds up "That Bat" — tonight, this drives the venue into a frenzied cauldron!'), "shake", "RYO");
    case "starStrings":
      return one("studio", who, "fired", L("「星の弦」に張り替える。弾いた瞬間、これは“満員”を呼ぶ音だと確信した。", 'Restrings with "Star Strings." The moment you play, you\'re sure — this is the sound that draws a sold-out crowd.'), "flash", who);
    case "whitePowder":
      return one("studio", who, "sad", L("「白い粉」に手を伸ばす——すべてを差し出す覚悟で。降ってくる旋律と引き換えに、心身は削れていく。", 'Reaches for the "White Powder" — ready to give up everything. In exchange for the melodies raining down, body and mind wear away.'), "shake", who);
    case "metalGodProof":
      return [
        mk("venueBig", lineup([...ALL], "fired"), L("「メタルゴッドの証」が輝きを放つ——空が裂け、天啓のごとき轟音がバンドを包む！", 'The "Proof of the Metal God" blazes with light — the sky splits, and a revelatory roar engulfs the band!'), { fx: "shake" }),
        mk("venueBig", lineup([...ALL], "happy"), L(`全能力が覚醒し、ファンが爆発的に増えた！\n\n${effect}`, `Every stat awakens, and the fans explode in number!\n\n${effect}`), { fx: "flash" }),
      ];
    default:
      return one("studio", who, "happy", L(`「${name}」を使った。`, `Used "${name}".`), "flash");
  }
}
