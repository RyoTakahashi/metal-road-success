// Game state, the per-turn action-card hand, and action resolution.
// Progression is a monthly loop: turnsPerMonth action cards, then a live.
// See docs/phase1-cards.md.

import { bandParam, SEG_WEIGHTS } from "./coreLoop";
import {
  composeScenes,
  contactScenes,
  itemFindScenes,
  moneyScenes,
  performScenes,
  pick,
  practiceScenes,
  promoScenes,
  restScenes,
} from "./flavor";
import type {
  ActionCard,
  ActionKind,
  BgKey,
  GameState,
  LiveDecision,
  LiveResult,
  Member,
  Param,
  Scene,
  Segment,
  Song,
  StaffRole,
} from "./types";
import { PARAM_LABEL, SEGMENT_LABEL, STAFF_LABEL } from "./types";

const TURNS_PER_MONTH = 4;
const clampStat = (n: number) => Math.max(0, Math.min(99, n));
const yen = (n: number) => `¥${n.toLocaleString()}`;

/** Below this average stamina the band is too exhausted to do anything but rest. */
export const FATIGUE_FLOOR = 25;

/** Average band stamina (0–100). */
export const bandStamina = (s: GameState): number =>
  s.members.reduce((a, m) => a + m.stamina, 0) / (s.members.length || 1);

/** A non-rest card is locked when the band is exhausted (forces 休息). */
export const isCardLocked = (s: GameState, kind: ActionKind): boolean =>
  kind !== "rest" && bandStamina(s) < FATIGUE_FLOOR;

/** Short stamina hint shown on a card. */
export function staminaTag(kind: ActionKind): string {
  if (kind === "rest") return "体力 回復";
  if (kind === "network") return "体力+ / 人脈・結束";
  return "体力 消費";
}

// --- Support staff (P2-2/3/4) ----------------------------------------------

export const STAFF_DEFS: Record<StaffRole, { cut: number; contactCost: number; desc: string }> = {
  producer: { cut: 0.15, contactCost: 4, desc: "毎ターンの手札 +1・作曲Q↑。ただし大箱志向の外圧（小箱続きで親密度↓）" },
  manager: { cut: 0.1, contactCost: 3, desc: "宣伝到達（マーケ力）が上がり動員が伸びる" },
  pa: { cut: 0.08, contactCost: 3, desc: "ライブ満足度が上がる。親密度が低いと当日トラブル" },
  roadie: { cut: 0.06, contactCost: 3, desc: "行動の体力消費を軽減・トラブルを抑える" },
};
export const STAFF_CAP = 3;
export const hasStaff = (s: GameState, role: StaffRole): boolean => s.staff.some((x) => x.role === role);
export const recruitableRoles = (s: GameState): StaffRole[] =>
  (Object.keys(STAFF_DEFS) as StaffRole[]).filter((r) => !hasStaff(s, r) && s.contacts >= STAFF_DEFS[r].contactCost);
/** Support staff can be scouted once major, with spare 人脈 and an open slot. */
export const canRecruit = (s: GameState): boolean =>
  s.rank === "major" && s.staff.length < STAFF_CAP && recruitableRoles(s).length > 0;

/** The four founding members (Vo/Gt/Ba/Dr). artKey is the sprite key. */
function initialMembers(): Member[] {
  return [
    { name: "RISA", artKey: "RYO", part: "Vo", isLeader: false, T: 48, P: 60, S: 52, V: 58, stamina: 100, love: 30 },
    { name: "NAO", artKey: "KEN", part: "Gt", isLeader: false, T: 64, P: 50, S: 55, V: 46, stamina: 100, love: 30 },
    { name: "MAKO", artKey: "MIO", part: "Ba", isLeader: false, T: 58, P: 46, S: 50, V: 44, stamina: 100, love: 30 },
    { name: "TOMO", artKey: "GO", part: "Dr", isLeader: false, T: 62, P: 44, S: 42, V: 40, stamina: 100, love: 30 },
  ];
}

/** Which existing member plays a given part. */
const PART_TO_ART: Record<string, string> = { Vo: "RYO", Gt: "KEN", Ba: "MIO", Dr: "GO" };
export const PARTS: { part: string; label: string; name: string }[] = [
  { part: "Vo", label: "ボーカル", name: "RISA" },
  { part: "Gt", label: "ギター", name: "NAO" },
  { part: "Ba", label: "ベース", name: "MAKO" },
  { part: "Dr", label: "ドラム", name: "TOMO" },
];

/** Start a fresh game as the leader of the chosen part (optionally renamed). */
export function newGame(part = "Vo", leaderName = "", rng: () => number = Math.random): GameState {
  const members = initialMembers();
  const artKey = PART_TO_ART[part] ?? "RYO";
  const leader = members.find((m) => m.artKey === artKey)!;
  leader.isLeader = true;
  if (leaderName.trim()) leader.name = leaderName.trim().slice(0, 12);
  // small leader bonus in their part's signature stat
  leader.P = clampStat(leader.P + 4);

  const state: GameState = {
    month: 1,
    rank: "indie",
    stage: 0,
    staff: [],
    items: { metalianD: 2 },
    buffs: { practiceMult: 1, practiceTurns: 0, restFull: false, composeQ95: false, liveSat: 0, liveSellout: false },
    turn: 1,
    turnsPerMonth: TURNS_PER_MONTH,
    hand: [],
    members,
    leaderPart: part,
    support: { mk: 0.2, sn: 0.15 },
    songs: [
      { name: "Iron Dawn", lean: { core: 0.55, light: 0.15, visual: 0.1, expert: 0.2 }, Q: 60, age: 1 },
    ],
    practiceFreshness: 80,
    contacts: 0,
    bond: 30,
    friendship: {},
    recent: {},
    funds: 300_000,
    totalFans: 1200,
    segFans: { core: 600, light: 300, visual: 150, expert: 150 },
    fame: 18,
    log: ["バンド「Metal Road」、活動開始！"],
  };
  dealHand(state, rng);
  return state;
}

// --- Card catalog -----------------------------------------------------------

const CARD: Record<ActionKind, ActionCard> = {
  rest: {
    kind: "rest",
    subs: [
      { id: "full", label: "完全休養", desc: "体力を大きく回復" },
      { id: "study", label: "社会勉強", desc: "体力＋少し ＆ 音楽センス↑" },
      { id: "hobby", label: "趣味に没頭", desc: "体力＋ ＆ ビジュ力↑" },
    ],
  },
  music: {
    kind: "music",
    subs: [
      { id: "compose", label: "作曲", desc: "新曲を書く（知名度維持に必須）" },
      { id: "practice", label: "練習", desc: "能力UP ＆ 練習の鮮度回復" },
      { id: "perform", label: "パフォーマンス", desc: "P↑ ＆ 小さくファン獲得" },
    ],
  },
  promo: { kind: "promo" },
  network: {
    kind: "network",
    subs: [
      { id: "band", label: "バンド関係者", desc: "結束を高め体力回復" },
      { id: "contact", label: "新たな人脈", desc: "マーケ力・知名度↑" },
    ],
  },
  money: { kind: "money" },
};

/** Deal a new hand: rest is always offered + 2 random of the rest. */
export function dealHand(state: GameState, rng: () => number = Math.random): void {
  const pool: ActionKind[] = ["music", "promo", "network", "money"];
  // shuffle (Fisher–Yates) and take 2
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const count = 2 + (hasStaff(state, "producer") ? 1 : 0); // a producer widens the hand
  const picks = pool.slice(0, count);
  state.hand = [CARD.rest, ...picks.map((k) => CARD[k])];
}

// --- Action resolution ------------------------------------------------------

const forEachMember = (s: GameState, fn: (m: Member) => void) => s.members.forEach(fn);
const addStamina = (s: GameState, d: number) =>
  forEachMember(s, (m) => (m.stamina = Math.max(0, Math.min(100, m.stamina + d))));
const addParam = (s: GameState, p: Param, d: number) =>
  forEachMember(s, (m) => (m[p] = clampStat(m[p] + d)));

/** Nudge one member's 愛情度 by artKey (clamped 0–100). */
export const addLove = (s: GameState, artKey: string, d: number): void => {
  const m = s.members.find((x) => x.artKey === artKey);
  if (m) m.love = Math.max(0, Math.min(100, m.love + d));
};
/** Average 愛情度 across the band (0–100). */
export const avgLove = (s: GameState): number =>
  s.members.reduce((a, m) => a + m.love, 0) / (s.members.length || 1);

/** A roadie eases the stamina cost of an action. */
const roadieRelief = (s: GameState): number => {
  const r = s.staff.find((x) => x.role === "roadie");
  return r ? 2 + Math.round(4 * (r.intimacy / 100)) : 0;
};
/** Spend stamina for an action (>=2), reduced by any roadie. */
const spend = (s: GameState, base: number) => addStamina(s, -Math.max(2, base - roadieRelief(s)));

function scene(bg: Scene["bg"], artKeys: string[], text: string, extra: Partial<Scene> = {}): Scene {
  return { bg, chars: artKeys.map((a, i) => ({ member: a, pos: i === 0 ? "center" : i === 1 ? "left" : "right" })), text, ...extra };
}

const leaderArt = (s: GameState) => s.members.find((m) => m.isLeader)?.artKey ?? "RYO";

/**
 * Resolve a played card. `param` is only used for music/practice.
 * Returns the VN scenes to show; state is mutated.
 */
export function resolveAction(
  state: GameState,
  kind: ActionKind,
  subId: string | undefined,
  param: Param | undefined,
  rng: () => number = Math.random,
): { scenes: Scene[] } {
  switch (kind) {
    case "rest":
      return resolveRest(state, subId ?? "full", rng);
    case "music":
      return resolveMusic(state, subId ?? "practice", param, rng);
    case "promo":
      return resolvePromo(state, rng);
    case "network":
      return resolveNetwork(state, subId ?? "band", rng);
    case "money":
      return resolveMoney(state, rng);
  }
}

function resolveRest(state: GameState, sub: string, rng: () => number): { scenes: Scene[] } {
  const L = leaderArt(state);
  if (state.buffs.restFull) {
    // ボインキラー: resting this turn fully restores everyone
    state.members.forEach((m) => (m.stamina = 100));
    state.buffs.restFull = false;
    pushLog(state, "休息（ボインキラー効果）：体力が全回復した！");
    return { scenes: [scene("backstage", [L], "妙な高揚感とともに、みなぎる活力。体力が全回復した！\n\n体力 MAX（全員）", { fx: "flash" })] };
  }
  if (sub === "study") {
    addStamina(state, 12);
    addParam(state, "S", 1);
    pushLog(state, "社会勉強：見聞を広げた（体力+12 / センス+1）");
    return { scenes: restScenes("study", "体力 +12・音楽センス +1（全員）", rng) };
  }
  if (sub === "hobby") {
    addStamina(state, 26);
    addParam(state, "V", 1);
    pushLog(state, "趣味に没頭：リフレッシュ（体力+26 / ビジュ+1）");
    return { scenes: restScenes("hobby", "体力 +26・ビジュ力 +1（全員）", rng) };
  }
  addStamina(state, 40);
  pushLog(state, "完全休養：しっかり休んだ（体力+40）");
  return { scenes: restScenes("full", "体力 +40（全員）", rng) };
}

function resolveMusic(
  state: GameState,
  sub: string,
  param: Param | undefined,
  rng: () => number,
): { scenes: Scene[] } {
  if (sub === "compose") {
    const s = bandParam(state.members, "S");
    const producer = state.staff.find((x) => x.role === "producer");
    const pQ = producer ? 10 * (producer.intimacy / 100) : 0; // producer lifts quality
    let Q = Math.max(20, Math.min(95, Math.round(0.7 * s + rng() * 20 + pQ)));
    if (state.buffs.composeQ95) {
      Q = 95;
      state.buffs.composeQ95 = false;
    }
    const n = state.songs.length + 1;
    const song: Song = {
      name: `New Track ${n}`,
      lean: { core: 0.5, light: 0.2, visual: 0.1, expert: 0.2 },
      Q,
      age: 0,
    };
    state.songs.push(song);
    spend(state, 14);
    pushLog(state, `作曲：新曲「${song.name}」が完成（Q${Q}）`);
    return { scenes: composeScenes(song.name, Q, rng) };
  }
  if (sub === "perform") {
    addParam(state, "P", 2);
    const f = 24 + Math.floor(rng() * 24); // 24–47 fans
    const c = Math.round(f * 0.4);
    state.segFans.light += f;
    state.segFans.core += c;
    state.totalFans += f + c;
    state.fame = Math.min(100, state.fame + 1);
    spend(state, 14);
    pushLog(state, `パフォーマンス特訓：ステージ度胸UP（P+2 / ファン+${f + c}）`);
    return { scenes: performScenes(`パフォーマンス +2・ファン +${f + c}`, rng) };
  }
  // practice — needs a param; item buffs multiply the gain
  const p = param ?? "T";
  const gain = Math.round(6 * state.buffs.practiceMult);
  addParam(state, p, gain);
  spend(state, 16);
  state.practiceFreshness = 100;
  pushLog(state, `練習：${PARAM_LABEL[p]}を強化（+${gain} / 全員）・練習の鮮度MAX`);
  const scenes = practiceScenes(p, gain, rng);
  // Sometimes a bandmate turns to the leader mid-session for a word (choice event).
  if (rng() < 0.5) scenes.splice(2, 0, ...practiceTalk(state, rng));
  return { scenes };
}

function resolvePromo(state: GameState, rng: () => number): { scenes: Scene[] } {
  state.fame = Math.min(100, state.fame + 3);
  state.support.sn = Math.min(1, state.support.sn + 0.03);
  const f = 14 + Math.floor(state.fame / 4);
  const c = Math.round(f * 0.3);
  state.segFans.light += f;
  state.segFans.core += c;
  state.totalFans += f + c;
  spend(state, 10);
  pushLog(state, `広報活動：SNS・宣伝を強化（知名度+3 / ファン+${f + c}）`);
  return { scenes: promoScenes(`知名度 +3・SNS効果UP・ファン +${f + c}`, rng) };
}

function resolveNetwork(state: GameState, sub: string, rng: () => number): { scenes: Scene[] } {
  if (sub === "contact") {
    state.contacts += 1;
    state.support.mk = Math.min(1, state.support.mk + 0.03);
    state.fame = Math.min(100, state.fame + 1);
    spend(state, 10);
    pushLog(state, `新たな人脈：業界の知り合いが増えた（人脈+1 → ${state.contacts} / マーケ力・知名度↑）`);
    return { scenes: contactScenes(`人脈 +1（計${state.contacts}）・マーケ力UP・知名度 +1`, rng) };
  }
  // Time with the crew warms up any hired staff (親密度) no matter what's said;
  // the heart-to-heart itself is an interactive talk (結束/愛情度 vary by reply).
  for (const st of state.staff) st.intimacy = Math.min(100, st.intimacy + 8);
  return { scenes: bondTalkScenes(state, rng) };
}

// --- Interactive member events (発言選択 + 愛情度) --------------------------

type Mood = "normal" | "fired" | "happy" | "sad";

/** One reply option: its effects and how the featured member reacts. */
interface Reply {
  label: string; // the leader's line (button text)
  love: number; // Δ愛情度 for the featured member
  bond?: number; // Δ結束 (band-wide)
  stam?: number; // Δ体力 (all members)
  funds?: number; // Δ資金
  stat?: { p: Param; d: number }; // small Δ to one skill (all members)
  react: string; // the member's reaction line
  mood: Mood;
}
interface Topic {
  line: string; // what the member opens with
  replies: Reply[];
}

const nonLeaders = (s: GameState): Member[] => s.members.filter((m) => !m.isLeader);
const sign = (n: number): string => (n >= 0 ? `+${n}` : `${n}`);

/** Build a 1-scene prompt + branching reactions for a member talk. */
function buildTalk(m: Member, topic: Topic, bg: BgKey): Scene[] {
  const choices = topic.replies.map((r) => {
    const bits: string[] = [`${m.name}の愛情度${sign(r.love)}`];
    if (r.bond) bits.push(`結束${sign(r.bond)}`);
    if (r.stam) bits.push(`体力${sign(r.stam)}`);
    if (r.funds) bits.push(`資金${sign(r.funds)}`);
    if (r.stat) bits.push(`${PARAM_LABEL[r.stat.p]}${sign(r.stat.d)}`);
    const summary = bits.join("・");
    return {
      label: r.label,
      apply: (s: GameState) => {
        addLove(s, m.artKey, r.love);
        if (r.bond) s.bond = Math.max(0, Math.min(100, s.bond + r.bond));
        if (r.stam) addStamina(s, r.stam);
        if (r.funds) s.funds += r.funds;
        if (r.stat) addParam(s, r.stat.p, r.stat.d);
        pushLog(s, `${m.name}と語らった：${summary}`);
      },
      next: [
        {
          bg,
          chars: [{ member: m.artKey, pos: "center" as const, mood: r.mood }],
          speaker: m.name,
          text: `${r.react}\n\n（${summary}）`,
          fx: (r.love > 0 ? "flash" : undefined) as Scene["fx"],
        },
      ],
    };
  });
  return [
    {
      bg,
      chars: [{ member: m.artKey, pos: "center" as const, mood: "normal" }],
      speaker: m.name,
      text: topic.line,
      choices,
    },
  ];
}

/** 交流（バンド関係者）：a random bandmate opens up; the reply shapes 結束/愛情度. */
const BOND_TOPICS: Topic[] = [
  {
    line: "「なあ、最近ちゃんと前に進めてるのかな……ふと不安になる時があってさ」",
    replies: [
      { label: "「大丈夫、ちゃんと進んでる。俺が保証する」", love: 9, bond: 8, mood: "happy", react: "「……そっか。あんたがそう言うなら、信じられるよ」" },
      { label: "「不安なら練習で埋めろ。手を動かせ」", love: 2, bond: 10, stam: -4, mood: "fired", react: "「……くっ、違いない。やってやるよ！」" },
      { label: "「わかる。俺も同じだよ」と弱音を共有", love: 6, bond: 6, mood: "normal", react: "「なんだ、あんたもか。ちょっと安心した」" },
    ],
  },
  {
    line: "「ねえ、今夜このあと軽く飲みに行かない？ たまには馬鹿な話がしたい」",
    replies: [
      { label: "「いいね、行こう。今日は付き合うよ」", love: 8, bond: 9, stam: 6, mood: "happy", react: "「よっしゃ！ こういう時間が一番効くんだって」" },
      { label: "「悪い、今日は曲作りたい」", love: -3, bond: 4, mood: "sad", react: "「……はいはい、真面目だこと。まあ、無理すんなよ」" },
      { label: "「一杯だけな」と付き合う", love: 5, bond: 7, mood: "normal", react: "「一杯って言うやつに限って朝までなんだよなあ」" },
    ],
  },
  {
    line: "「正直さ、あんたがリーダーで良かったって思ってる。……柄じゃないけど、言っときたくて」",
    replies: [
      { label: "「……ありがとう。お前がいるからだよ」", love: 12, bond: 8, mood: "happy", react: "「うわ、照れるからやめろって！ ……でも、うん」" },
      { label: "「当たり前だろ、ついてこい」", love: 4, bond: 9, mood: "fired", react: "「ははっ、その強気、嫌いじゃないよ」" },
      { label: "「急にどうした、気持ち悪いな」と茶化す", love: -2, bond: 5, mood: "sad", react: "「……せっかく良いこと言ったのに。もう知らね」" },
    ],
  },
];

/** Return an interactive bond talk with a random bandmate. */
export function bondTalkScenes(state: GameState, rng: () => number = Math.random): Scene[] {
  const m = pick(rng, nonLeaders(state));
  return buildTalk(m, pick(rng, BOND_TOPICS), "backstage");
}

/** 練習中の発言選択：per-member topics (personality-specific). */
const PRACTICE_TOPICS_BY_MEMBER: Record<string, Topic[]> = {
  RYO: [ // RISA — cocky frontwoman lion
    {
      line: "「ねえ、あたしのシャウト……今日、いつもよりキレてない？ ちゃんと見てた？」",
      replies: [
        { label: "「見てた。鳥肌立った、マジで」", love: 6, stat: { p: "P", d: 1 }, mood: "happy", react: "「でしょ！？ ふふ、あんたに褒められると悪くないね」" },
        { label: "「あと一歩。喉の開き方、詰めよう」", love: 3, stat: { p: "V", d: 1 }, stam: -2, mood: "fired", react: "「……上等。あたしの限界、まだ先にあるってことね」" },
        { label: "「うーん、いつも通りじゃない？」", love: -4, mood: "sad", react: "「はぁ！？ ……今の、後悔するからね」" },
      ],
    },
    {
      line: "「新しい衣装、攻めすぎかな？ ……あんたはどう思う？」",
      replies: [
        { label: "「最高。誰よりお前が目立つ」", love: 7, stat: { p: "V", d: 1 }, mood: "happy", react: "「ん、決まりね。ステージ、燃やしてやる」" },
        { label: "「動きやすさも考えような」", love: 3, mood: "normal", react: "「……たしかに。暴れられなきゃ意味ないもんね」" },
        { label: "「派手すぎない？」", love: -3, mood: "sad", react: "「あたしに地味でいろって？ ありえない」" },
      ],
    },
  ],
  KEN: [ // NAO — stoic shredder bird
    {
      line: "「このリフ、まだ甘い気がする。……お前ならどう組む？」",
      replies: [
        { label: "「今ので完成してる。信じろ」", love: 6, stat: { p: "S", d: 1 }, mood: "happy", react: "「……そうか。お前が言うなら、これでいく」" },
        { label: "「もっと邪悪にできる。詰めよう」", love: 4, stat: { p: "T", d: 1 }, stam: -3, mood: "fired", react: "「……っ、やっぱそう来るか。よし、朝までやるぞ」" },
        { label: "「考えすぎ。手癖で弾け」", love: -3, mood: "sad", react: "「……お前に聞いた俺が馬鹿だった」" },
      ],
    },
    {
      line: "「指、ついてこなくなってきた……少し落とすか？」",
      replies: [
        { label: "「休め。壊したら元も子もない」", love: 6, stam: 6, mood: "happy", react: "「……悪いな。少し、休ませてもらう」" },
        { label: "「限界の先に、答えがある」", love: 3, stat: { p: "T", d: 1 }, stam: -3, mood: "fired", react: "「……ふっ、鬼だな。嫌いじゃない」" },
        { label: "「気合が足りないだけだろ」", love: -4, mood: "sad", react: "「……そういうことを言う奴だったか」" },
      ],
    },
  ],
  MIO: [ // MAKO — cool, quiet frog
    {
      line: "「……ベースライン、埋もれてない？ 正直に言って」",
      replies: [
        { label: "「土台として完璧に効いてる」", love: 6, stat: { p: "T", d: 1 }, mood: "happy", react: "「……よかった。ちゃんと、聴いてくれてるんだ」" },
        { label: "「もう少し前に出ていい」", love: 4, stat: { p: "S", d: 1 }, stam: -2, mood: "fired", react: "「ん。……じゃあ、少しだけ、暴れる」" },
        { label: "「ベースって聴こえてた？」", love: -4, mood: "sad", react: "「……最低。もう聞かない」" },
      ],
    },
    {
      line: "「（無言でこっちを見て、ふっと小さく笑った）……なに？」",
      replies: [
        { label: "「いや、良い音出すなと思って」", love: 7, mood: "happy", react: "「……ふふ。あなたも、悪くない」" },
        { label: "「集中しよう」と練習に戻す", love: 2, stat: { p: "S", d: 1 }, mood: "normal", react: "「ん。……そうだね。続けよ」" },
        { label: "「にやけてて気持ち悪い」", love: -4, mood: "sad", react: "「……ひどい。もう笑わない」" },
      ],
    },
  ],
  GO: [ // TOMO — energetic rabbit drummer
    {
      line: "「ねえねえ、今のフィルどうだった！？ 新しいの入れてみたの！」",
      replies: [
        { label: "「めっちゃ良かった！ 攻めてる！」", love: 7, stat: { p: "P", d: 1 }, mood: "happy", react: "「やった〜！ もっと変なの入れちゃうもんね！」" },
        { label: "「良いけど、走り気味かも」", love: 4, stat: { p: "T", d: 1 }, stam: -2, mood: "fired", react: "「うっ……で、でも直す！ もう一回！」" },
        { label: "「普通じゃない？」", love: -4, mood: "sad", react: "「えぇ〜っ、そんなぁ……ちぇっ」" },
      ],
    },
    {
      line: "「手、めっちゃパンパン……でもまだ叩けるよ！ どうする？」",
      replies: [
        { label: "「無理すんな。休憩しよう」", love: 6, stam: 6, mood: "happy", react: "「えへへ、優しい〜。じゃあ、ちょっとだけ休も！」" },
        { label: "「その意気だ、もう一曲！」", love: 4, stat: { p: "P", d: 1 }, stam: -3, mood: "fired", react: "「いっくよ〜！ ドコドコドコッ!!」" },
        { label: "「根性がないなあ」", love: -4, mood: "sad", react: "「ひどっ！ あたし、こんなに頑張ってるのに〜っ」" },
      ],
    },
  ],
};

/** An in-practice reply moment: a random bandmate raises their own topic. */
export function practiceTalk(state: GameState, rng: () => number = Math.random): Scene[] {
  const m = pick(rng, nonLeaders(state));
  const topics = PRACTICE_TOPICS_BY_MEMBER[m.artKey];
  if (!topics || topics.length === 0) return [];
  return buildTalk(m, pick(rng, topics), "studio");
}

/** Standalone “member moment” events, keyed to a member's personality. */
interface MemberEvent extends Topic {
  art: string;
  bg: BgKey;
}
const MEMBER_EVENTS: MemberEvent[] = [
  {
    art: "KEN", // NAO — stoic shredder
    bg: "studio",
    line: "「このリフ、どうしても納得いかない。……なあ、正直どう思う？」",
    replies: [
      { label: "「めちゃくちゃ良い。自信持て」", love: 8, stat: { p: "S", d: 1 }, mood: "happy", react: "「……そうか。あんたがそう言うなら、これでいく」" },
      { label: "「まだ甘い。一緒に詰めよう」", love: 5, stat: { p: "T", d: 1 }, stam: -3, mood: "fired", react: "「……っ、やっぱそう思うよな。よし、朝までやるぞ」" },
      { label: "「考えすぎ。手癖で弾け」", love: -2, mood: "sad", react: "「……お前に聞いた俺が馬鹿だった」" },
    ],
  },
  {
    art: "GO", // TOMO — bouncy drummer
    bg: "street",
    line: "「ねえねえ！ 次のライブ、ドラムソロで新技ぶっこんでいい！？ めっちゃ練習したの！」",
    replies: [
      { label: "「最高じゃん、やっちゃえ！」", love: 9, stat: { p: "P", d: 1 }, mood: "happy", react: "「やった〜！ 絶対ウケさせるからね、見てて！」" },
      { label: "「いいけど、失敗すんなよ？」", love: 4, mood: "normal", react: "「うっ……で、でも大丈夫！ たぶん！」" },
      { label: "「まだ早い。基礎を固めろ」", love: -3, stat: { p: "T", d: 1 }, mood: "sad", react: "「……はーい。ちぇっ、分かってるってば」" },
    ],
  },
  {
    art: "MIO", // MAKO — cool, quiet worrier
    bg: "backstage",
    line: "「……お金、足りてる？ わたし、バイト増やそうか」",
    replies: [
      { label: "「気にすんな。ここは俺が持つ」", love: 8, funds: -20_000, mood: "happy", react: "「……そう。じゃあ、甘えとく。ありがと」" },
      { label: "「助かる。頼めるか？」", love: 5, funds: 30_000, stam: -4, mood: "normal", react: "「ん。……たまには頼ってくれて、嬉しい」" },
      { label: "「金の心配より練習しろ」", love: -3, mood: "sad", react: "「……そうだね。余計なこと言った」" },
    ],
  },
  {
    art: "RYO", // RISA — cocky frontwoman
    bg: "studio",
    line: "「ねえ、あたしのステージング、ちゃんと『ヤバい』って言える？ 忖度なしで」",
    replies: [
      { label: "「ヤバい。会場全部持ってける」", love: 9, stat: { p: "V", d: 1 }, mood: "happy", react: "「でしょ！？ ……ふふ、あんたに言われると悪くないね」" },
      { label: "「まだ伸びる。もっと化けろ」", love: 4, stat: { p: "P", d: 1 }, stam: -3, mood: "fired", react: "「上等。あたしの限界、見せてやる」" },
      { label: "「普通じゃない？」と流す", love: -4, mood: "sad", react: "「……は？ 今の発言、後悔するよあんた」" },
    ],
  },
];

/** ~28% at the start of a turn: a bandmate pulls the leader aside (choice event). */
export function maybeMemberEvent(state: GameState, rng: () => number = Math.random): Scene[] | null {
  if (rng() >= 0.28) return null;
  const leaderKey = state.members.find((m) => m.isLeader)?.artKey;
  const pool = MEMBER_EVENTS.filter((e) => e.art !== leaderKey && state.members.some((m) => m.artKey === e.art));
  if (pool.length === 0) return null;
  const e = pick(rng, pool);
  const m = state.members.find((mm) => mm.artKey === e.art)!;
  return buildTalk(m, { line: e.line, replies: e.replies }, e.bg);
}

// --- 友情イベント（愛情度が一定に達すると発火・1回きり）---------------------

/** 愛情度がこの値以上になったメンバーと、特別な友情イベントが起きる。 */
export const FRIENDSHIP_THRESHOLD = 70;

/** Per-member friendship payoff: a heartfelt scene + a permanent boon. */
interface Friendship {
  bg: BgKey;
  line: string; // the member's heartfelt line
  boon: string; // human-readable reward
  apply: (s: GameState) => void; // the permanent effect
}
const FRIENDSHIPS: Record<string, Friendship> = {
  RYO: {
    bg: "backstage",
    line: "「あたしさ、あんたとバンド組めて本気で良かったと思ってる。……一生ついてく。だからさ、絶対てっぺん獲るよ」",
    boon: "RISAとの絆が深まった：パフォーマンス+6（永続）",
    apply: (s) => { const m = s.members.find((x) => x.artKey === "RYO"); if (m) m.P = clampStat(m.P + 6); },
  },
  KEN: {
    bg: "studio",
    line: "「……柄じゃないけど言わせてくれ。お前の音楽を信じてる。俺のギター、全部お前に預ける」",
    boon: "NAOとの絆が深まった：演奏基礎+6（永続）",
    apply: (s) => { const m = s.members.find((x) => x.artKey === "KEN"); if (m) m.T = clampStat(m.T + 6); },
  },
  MIO: {
    bg: "backstage",
    line: "「わたし、あんまり喋らないけど……ちゃんと見てる。あなたの隣が、いちばん落ち着く。ずっと弾かせて」",
    boon: "MAKOとの絆が深まった：音楽センス+6（永続）",
    apply: (s) => { const m = s.members.find((x) => x.artKey === "MIO"); if (m) m.S = clampStat(m.S + 6); },
  },
  GO: {
    bg: "street",
    line: "「あたしね、このバンドが世界でいちばん好き！ みんなと叩いてると無敵になれるの。ずーっと一緒だよ！」",
    boon: "TOMOとの絆が深まった：ビジュ力+6（永続）",
    apply: (s) => { const m = s.members.find((x) => x.artKey === "GO"); if (m) m.V = clampStat(m.V + 6); },
  },
};

/** If any bandmate has crossed the affection threshold, fire their (one-time)
 *  friendship event: a special scene + a permanent boon. Marks it done. */
export function pendingFriendshipScenes(state: GameState): Scene[] | null {
  const m = state.members.find(
    (x) => !x.isLeader && x.love >= FRIENDSHIP_THRESHOLD && !state.friendship[x.artKey] && FRIENDSHIPS[x.artKey],
  );
  if (!m) return null;
  const f = FRIENDSHIPS[m.artKey];
  state.friendship[m.artKey] = true;
  f.apply(state);
  state.bond = Math.min(100, state.bond + 6);
  pushLog(state, `💞 友情イベント：${m.name}との絆が深まった！（${f.boon}・結束+6）`);
  return [
    { bg: f.bg, chars: [{ member: m.artKey, pos: "center", mood: "happy" }], speaker: m.name, text: f.line, fx: "flash" },
    {
      bg: f.bg,
      chars: [{ member: m.artKey, pos: "center", mood: "fired" }],
      text: `💞 ${m.name}との友情が深まった——！\n\n${f.boon}\n結束 +6`,
      fx: "flash",
    },
  ];
}

/** The event to show at the start of a turn: friendship (priority) or a moment. */
export function nextTurnEvent(state: GameState, rng: () => number = Math.random): Scene[] | null {
  return pendingFriendshipScenes(state) ?? maybeMemberEvent(state, rng);
}

// --- ライブ中のMC/パフォーマンス選択（出来栄えが少し変わる）-----------------

/** Pre-show beats: huddle + two in-the-moment choices that nudge the live. The
 *  choices bank satisfaction into buffs.liveSat, consumed by resolveLive. */
/** Pick an index in [0,len) that isn't the same as last time for `key` (avoids
 *  back-to-back repeats so recurring events stay fresh). */
function pickIdxNoRepeat(state: GameState, key: string, len: number, rng: () => number): number {
  const last = state.recent[key];
  let i = Math.floor(rng() * len);
  if (len > 1 && i === last) i = (i + 1 + Math.floor(rng() * (len - 1))) % len;
  state.recent[key] = i;
  return i;
}

/** One MC option: its line, which layers it flatters, base satisfaction, effect. */
interface McOption { label: string; favored: Segment[]; base: number; extra?: (s: GameState) => void; note?: string }

/** 5 opening-MC scripts (第一声). Picked with no back-to-back repeats. */
const LIVE_MC_SCRIPTS: McOption[][] = [
  [
    { label: "「準備はいいかァ——ッ!? 声、聞かせろォ!!」", favored: ["core", "light"], base: 3 },
    { label: "「俺たちがMetal Roadだ！ 名前、刻んで帰れ！」", favored: ["light", "visual"], base: 3, note: "・知名度+1", extra: (s) => { s.fame = Math.min(100, s.fame + 1); } },
    { label: "「……来てくれてありがとう。全部込める」", favored: ["expert", "core"], base: 3, note: "・結束+4", extra: (s) => { s.bond = Math.min(100, s.bond + 4); } },
  ],
  [
    { label: "「今夜、暴れる覚悟はできてるかァ!?」", favored: ["core", "light"], base: 3 },
    { label: "「初めての奴も常連も、まとめて持ってく！」", favored: ["light", "visual"], base: 3, note: "・知名度+1", extra: (s) => { s.fame = Math.min(100, s.fame + 1); } },
    { label: "「今の俺たちの音、その目に焼きつけろ」", favored: ["expert", "visual"], base: 3 },
  ],
  [
    { label: "「声、限界まで出していけェ——!!」", favored: ["core", "light"], base: 3 },
    { label: "「ようこそ、俺たちの世界へ」", favored: ["visual", "light"], base: 3, note: "・知名度+1", extra: (s) => { s.fame = Math.min(100, s.fame + 1); } },
    { label: "「難しい話は抜きだ。ぶちかますぞ」", favored: ["core", "expert"], base: 3 },
  ],
  [
    { label: "「ヘドバンの準備、いいなァ!?」", favored: ["core", "light"], base: 3 },
    { label: "「今日を一生忘れられない夜にする」", favored: ["visual", "expert"], base: 3, note: "・結束+3", extra: (s) => { s.bond = Math.min(100, s.bond + 3); } },
    { label: "「ここからは無礼講だ。全部出せ！」", favored: ["core", "light"], base: 3 },
  ],
  [
    { label: "「叫びたい奴、全員かかってこい!!」", favored: ["core", "light"], base: 3 },
    { label: "「見せてやる、これがメタルロードだ」", favored: ["light", "visual"], base: 3, note: "・知名度+1", extra: (s) => { s.fame = Math.min(100, s.fame + 1); } },
    { label: "「静かに始めよう……嵐の前の、な」", favored: ["expert", "visual"], base: 3 },
  ],
];

/** 5 encore-MC scripts (間奏〜アンコールの煽り). Picked with no repeats. */
const LIVE_ENCORE_MC_SCRIPTS: McOption[][] = [
  [
    { label: "「もう一曲——付き合えるかァ!?」", favored: ["core", "light"], base: 3 },
    { label: "「最後まで声、枯らしていけ!!」", favored: ["core", "light"], base: 3 },
    { label: "「この余韻、忘れんなよ」", favored: ["expert", "visual"], base: 3 },
  ],
  [
    { label: "「まだ帰さねえぞ、覚悟しろ!!」", favored: ["core", "light"], base: 3 },
    { label: "「みんなで最高のラスト、作ろう」", favored: ["light", "visual"], base: 3 },
    { label: "「耳、澄ませてろ——本気の一発だ」", favored: ["expert", "core"], base: 3 },
  ],
  [
    { label: "「アンコールありがとう！ ブチかますぞ!!」", favored: ["core", "light"], base: 3 },
    { label: "「今夜いちばんデカい声、聞かせろ!!」", favored: ["core", "light"], base: 3 },
    { label: "「締めは、俺たちの美学を見せる」", favored: ["visual", "expert"], base: 3 },
  ],
  [
    { label: "「体力、まだ残ってるよなァ!?」", favored: ["core", "light"], base: 3 },
    { label: "「一生分の思い出、置いてけ」", favored: ["visual", "expert"], base: 3 },
    { label: "「最後の一音まで、魂込める」", favored: ["expert", "core"], base: 3 },
  ],
  [
    { label: "「声が嗄れるまで叫べェ!!」", favored: ["core", "light"], base: 3 },
    { label: "「この一体感、最高だろ？」", favored: ["light", "core"], base: 3 },
    { label: "「幕引きは、静かに、美しく」", favored: ["visual", "expert"], base: 3 },
  ],
];

const SOLO_INSTR: Record<string, string> = { RYO: "ボーカル", KEN: "ギター", MIO: "ベース", GO: "ドラム" };
const SOLO_BURST: Record<string, string> = {
  RYO: "の絶叫がPAを突き破り、フロアが総立ちで咆哮を返す",
  KEN: "の指が指板を疾走、速弾きに指笛と歓声が突き刺さる",
  MIO: "の重低音が地面ごと客を揺らし、地鳴りの縦ノリが起きる",
  GO: "の連打がBPMをねじ上げ、モッシュの渦が爆ぜる",
};

/** How well a member's stats fit a target layer (higher = better solo pick). */
const MATCH_BONUS = 2;
const segFit = (m: Member, t: Segment): number =>
  (["T", "P", "S", "V"] as Param[]).reduce((a, p) => a + SEG_WEIGHTS[t][p] * m[p], 0);
const bestSoloistKey = (s: GameState, t: Segment): string => {
  const cand = nonLeaders(s);
  return cand.reduce((best, m) => (segFit(m, t) > segFit(best, t) ? m : best), cand[0]).artKey;
};

/** Pre-show, now a two-round set (本編 → 間奏MC → アンコール). Each choice's
 *  payoff and reaction depend on the target fan layer and member 相性. */
export function buildLivePreScenes(state: GameState, decision: LiveDecision, rng: () => number = Math.random): Scene[] {
  const venue = decision.cap <= 300 ? "小箱" : decision.cap <= 600 ? "ホール" : "アリーナ";
  const bg: BgKey = decision.cap >= 1000 ? "venueBig" : "venueSmall";
  const L = leaderArt(state);
  const lname = nameOf(state, L);
  const target = decision.target;
  const seg = SEGMENT_LABEL[target];
  const others = nonLeaders(state).map((m) => m.artKey);
  const bud = pick(rng, others);
  const ideal = bestSoloistKey(state, target); // the member who best fits the target layer
  const react = (member: string, mood: Mood, text: string, fx?: Scene["fx"]): Scene => ({
    bg, chars: [{ member, pos: "center", mood }], speaker: nameOf(state, member), text, fx,
  });
  // A choice whose satisfaction and reaction depend on fitting the target layer.
  const fit = (
    label: string,
    favored: Segment[],
    base: number,
    whenMatch: (sat: number) => Scene,
    whenMiss: (sat: number) => Scene,
    extra?: (s: GameState) => void,
  ) => {
    const matched = favored.includes(target);
    const sat = base + (matched ? MATCH_BONUS : 0);
    return { label, apply: (s: GameState) => { s.buffs.liveSat += sat; extra?.(s); }, next: [matched ? whenMatch(sat) : whenMiss(sat)] };
  };
  // Build one MC option from a script entry, with shared match/miss reactions.
  const mkMc = (o: McOption) => fit(o.label, o.favored, o.base,
    (sat) => react(bud, "fired", `${nameOf(state, bud)}と客席が呼応！ ${seg}層のど真ん中に突き刺さった！（満足度+${sat}${o.note ?? ""}）`, "shake"),
    (sat) => react(bud, "normal", `煽りはしっかり通った。が、${seg}層への刺さりはそこそこ。（満足度+${sat}${o.note ?? ""}）`),
    o.extra);
  // 5-pattern scripts, no back-to-back repeats.
  const mcChoices = LIVE_MC_SCRIPTS[pickIdxNoRepeat(state, "liveMc", LIVE_MC_SCRIPTS.length, rng)].map(mkMc);
  const encChoices = LIVE_ENCORE_MC_SCRIPTS[pickIdxNoRepeat(state, "liveEncoreMc", LIVE_ENCORE_MC_SCRIPTS.length, rng)].map(mkMc);

  return [
    {
      bg: "backstage",
      chars: [{ member: L, pos: "center", mood: "fired" }],
      text: `${venue}の袖。今日のターゲットは${seg}層。深呼吸ひとつ——行くぞ。`,
    },
    // === 本編：MC第一声（5パターン・連続同一なし）===
    {
      bg, chars: [{ member: L, pos: "center", mood: "fired" }], speaker: lname,
      text: `【本編・MC】${seg}層で埋まった客席へ、第一声は？`,
      choices: mcChoices,
    },
    // === 本編：ソロ回し（相性＝ターゲット最適メンバー）===
    {
      bg, chars: [{ member: L, pos: "center", mood: "fired" }], speaker: lname,
      text: `【本編・ソロ回し】曲が最高潮。ここぞの見せ場、誰に振る？（${seg}層に刺さるのは…？）`,
      choices: others.map((art) => {
        const matched = art === ideal;
        const sat = 3 + (matched ? MATCH_BONUS : 0);
        return {
          label: `「${SOLO_INSTR[art] ?? "ソロ"}——${nameOf(state, art)}ッ!!」`,
          apply: (s: GameState) => { s.buffs.liveSat += sat; addLove(s, art, 3); },
          next: [matched
            ? react(art, "fired", `${nameOf(state, art)}${SOLO_BURST[art] ?? "のソロが炸裂"}！${seg}層のツボにドハマり、大爆発だ！（満足度+${sat}・${nameOf(state, art)}の愛情度+3）`, "shake")
            : react(art, "fired", `${nameOf(state, art)}${SOLO_BURST[art] ?? "のソロが炸裂"}！ 沸くには沸くが、${seg}層への刺さりはそこそこ。（満足度+${sat}・${nameOf(state, art)}の愛情度+3）`, "shake")],
        };
      }),
    },
    // === アンコール導入 ===
    {
      bg, chars: [{ member: pick(rng, others), pos: "center", mood: "happy" }],
      text: "本編ラスト——照明が落ちても鳴り止まぬ「アンコール！」の大合唱。もう一度、ステージへ！",
      fx: "flash",
    },
    // === アンコール：間奏MC（5パターン・連続同一なし）===
    {
      bg, chars: [{ member: L, pos: "center", mood: "fired" }], speaker: lname,
      text: "【アンコール・MC】再びマイクを取る。締めの煽り、どういく？",
      choices: encChoices,
    },
    // === アンコール：ラストソングの締め ===
    {
      bg, chars: [{ member: L, pos: "center", mood: "fired" }], speaker: lname,
      text: "【アンコール・締め】ラストソング。どう終わらせる？",
      choices: [
        fit("定番曲でブチ上げてフィニッシュ", ["core", "light"], 4,
          (sat) => react(bud, "fired", `全員大合唱、会場が一つの生き物になる。${seg}層、大満足の大団円！（満足度+${sat}）`, "flash"),
          (sat) => react(bud, "happy", `手堅く締める。しっかり温まった。（満足度+${sat}）`)),
        fit("新曲で勝負を賭ける", ["expert", "core"], 4,
          (sat) => react(bud, "fired", `攻めの新曲——耳の肥えた${seg}層が唸り、深く頷く。挑戦が実った！（満足度+${sat}・知名度+1）`, "flash"),
          (sat) => react(bud, "normal", `新曲を叩きつける。反応は分かれたが、爪痕は残した。（満足度+${sat}・知名度+1）`),
          (s) => { s.fame = Math.min(100, s.fame + 1); }),
        fit("バラードでしっとり締める", ["visual", "expert"], 4,
          (sat) => react(L, "happy", `揺れる無数のライト。${seg}層がうっとりと聴き入る、美しい幕引き。（満足度+${sat}・結束+3）`, "flash"),
          (sat) => react(L, "normal", `余韻を残して締める。悪くない、が熱量はやや落ち着いた。（満足度+${sat}・結束+3）`),
          (s) => { s.bond = Math.min(100, s.bond + 3); }),
      ],
    },
  ];
}

// --- ライブ後の打ち上げ（選択で結束・愛情度が動く）--------------------------

/** One after-party reply: effect + the host's response line. */
interface PartyOption { label: string; love: number; bond: number; stam?: number; mood: Mood; react: string }
interface PartyScript { ask: string; options: PartyOption[] }

/** 5 after-party conversations (host asks → 3 replies). No back-to-back repeats. */
const PARTY_SCRIPTS: PartyScript[] = [
  {
    ask: "「ねえ、今日のライブ、リーダー的にどうだった？」",
    options: [
      { label: "「全員最高だった。ありがとう」", love: 6, bond: 8, stam: 6, mood: "happy", react: "「へへ、そう言われると照れるな。……次もいくぞ！」" },
      { label: "「まだ通過点。次はもっと上だ」", love: 4, bond: 10, mood: "fired", react: "「上等！ その意気、ついていくよ」" },
      { label: "「細けえ話は抜き、今日は飲むぞ！」", love: 7, bond: 6, stam: -4, mood: "happy", react: "「よっしゃ！ 今日は無礼講だ！」" },
    ],
  },
  {
    ask: "「打ち上げの主役はリーダーでしょ。一言ちょうだい！」",
    options: [
      { label: "「お前らがいて本当に良かった」", love: 8, bond: 7, mood: "happy", react: "「……もう、泣かせないでよ」" },
      { label: "「反省会だ。次に活かすぞ」", love: 3, bond: 9, stam: -2, mood: "fired", react: "「うへぇ真面目。……でも、そういうとこ信頼してる」" },
      { label: "「とりあえず乾杯！ 話は明日！」", love: 6, bond: 6, stam: 4, mood: "normal", react: "「あはは、それでこそ。かんぱーい！」" },
    ],
  },
  {
    ask: "「次のライブはどこ狙う？ ……の前に、今日の感想は？」",
    options: [
      { label: "「最高の夜だった。みんなのおかげ」", love: 7, bond: 7, mood: "happy", react: "「えへへ、まかせて！ もっとデカくするよ」" },
      { label: "「課題も見えた。詰めていこう」", love: 4, bond: 8, stam: -2, mood: "fired", react: "「ん、頼もしい。ついてく」" },
      { label: "「今日は何も考えず飲もう」", love: 6, bond: 5, stam: 4, mood: "happy", react: "「さんせー！ ぐいっといこ！」" },
    ],
  },
  {
    ask: "「リーダー、お疲れ！ ……なんか、いい顔してるね？」",
    options: [
      { label: "「お前らと組めて幸せだ、って顔だよ」", love: 8, bond: 8, mood: "happy", react: "「……っ、ずるいなあ、その言い方」" },
      { label: "「まだ満足してない顔だ」", love: 4, bond: 9, mood: "fired", react: "「ふふ、貪欲。だから好きなんだ、このバンド」" },
      { label: "「腹減った顔だ。飯行こう」", love: 6, bond: 6, stam: 4, mood: "normal", react: "「あははっ、なにそれ！ 行こ行こ！」" },
    ],
  },
  {
    ask: "「今日のMVP、誰だと思う？ ……リーダーはどう見てた？」",
    options: [
      { label: "「全員がMVPだ。胸張れ」", love: 7, bond: 8, mood: "happy", react: "「もー、ずるい答え！ ……でも嬉しい」" },
      { label: "「あえて言うなら、次の自分たちだ」", love: 4, bond: 9, mood: "fired", react: "「かっこつけ！ ……嫌いじゃないけどね」" },
      { label: "「MVPは、来てくれた客だろ」", love: 6, bond: 7, mood: "normal", react: "「……たしかに。あんた、たまに良いこと言う」" },
    ],
  },
];

/** After-party at the month-end live: tone shifts with how the show went, and
 *  the conversation is one of 5 scripts (never the same one twice running). */
export function buildAfterPartyScenes(state: GameState, r: LiveResult, rng: () => number = Math.random): Scene[] {
  const great = r.satisfaction >= 65;
  const crew = state.members.map((m) => m.artKey);
  const host = pick(rng, state.members.filter((m) => !m.isLeader)).artKey;
  const hname = nameOf(state, host);
  const opener = great
    ? "打ち上げへ繰り出す。「今日は最高だった！ 乾杯——！」グラスがぶつかる。"
    : "打ち上げへ。「まあ、こういう日もある」ぬるいビールで小さく乾杯。";
  const partyMood: Mood = great ? "happy" : "normal";
  const chars: Scene["chars"] = crew.map((a, i) => ({
    member: a,
    pos: (["left", "center", "right", "left"] as const)[i] ?? "center",
    mood: partyMood,
  }));
  const summary = (love: number, bond: number, stam = 0) =>
    `全員の愛情度+${love}・結束+${bond}${stam ? `・体力${stam >= 0 ? "+" : ""}${stam}` : ""}`;
  const script = PARTY_SCRIPTS[pickIdxNoRepeat(state, "party", PARTY_SCRIPTS.length, rng)];
  const choices = script.options.map((o) => ({
    label: o.label,
    apply: (s: GameState) => {
      s.members.forEach((m) => { if (!m.isLeader) m.love = Math.min(100, m.love + o.love); });
      s.bond = Math.min(100, s.bond + o.bond);
      if (o.stam) addStamina(s, o.stam);
      pushLog(s, `打ち上げ：${summary(o.love, o.bond, o.stam ?? 0)}`);
    },
    next: [
      {
        bg: "backstage" as BgKey,
        chars: [{ member: host, pos: "center" as const, mood: o.mood }],
        speaker: hname,
        text: `${o.react}\n\n（${summary(o.love, o.bond, o.stam ?? 0)}）`,
        fx: "flash" as Scene["fx"],
      },
    ],
  }));
  return [
    { bg: "backstage", chars, text: opener, fx: great ? "flash" : undefined },
    { bg: "backstage", chars: [{ member: host, pos: "center", mood: partyMood }], speaker: hname, text: script.ask, choices },
  ];
}

/** Scout a support member, spending 人脈. Returns the intro scenes. */
export function resolveRecruit(state: GameState, role: StaffRole): { scenes: Scene[] } {
  const def = STAFF_DEFS[role];
  state.contacts = Math.max(0, state.contacts - def.contactCost);
  state.staff.push({ role, intimacy: 30, cut: def.cut });
  const pct = Math.round(def.cut * 100);
  pushLog(state, `${STAFF_LABEL[role]}が加入！（人脈-${def.contactCost} / 人件費${pct}%）`);
  return {
    scenes: [
      scene("backstage", [leaderArt(state)], `${STAFF_LABEL[role]}がチームに加わった。\n\n${def.desc}\nただしライブ収益の${pct}%が人件費に。親密度が下がると離脱・トラブルの恐れ（「バンド関係者との交流」で親密度UP）。`, { fx: "flash" }),
    ],
  };
}

function resolveMoney(state: GameState, rng: () => number): { scenes: Scene[] } {
  const amt = 60_000 + Math.floor(rng() * 40_000);
  state.funds += amt;
  spend(state, 12);
  pushLog(state, `アルバイト：${yen(amt)}稼いだ`);
  return { scenes: moneyScenes(`${yen(amt)}を稼いだ。ライブの会場費はここで貯める。`, rng) };
}

// --- Items ------------------------------------------------------------------

const bandAvg = (s: GameState, p: Param): number =>
  Math.round(s.members.reduce((a, m) => a + m[p], 0) / (s.members.length || 1));
const addStaffIntimacy = (s: GameState, d: number) =>
  s.staff.forEach((st) => (st.intimacy = Math.max(0, Math.min(100, st.intimacy + d))));
const setPracticeBuff = (s: GameState, mult: number, turns: number) => {
  s.buffs.practiceMult = mult;
  s.buffs.practiceTurns = turns;
};

export interface ItemDef {
  id: string;
  name: string;
  tier: "S" | "A" | "B";
  effect: string;
  desc: string;
  appearReq?: (s: GameState) => boolean; // appearance condition (drop pool)
  apply: (s: GameState) => void;
}

export const ITEMS: ItemDef[] = [
  { id: "metalianD", name: "メタリアンD", tier: "B", effect: "使用すると体力が最大60回復", desc: "コンビニに売ってる栄養ドリンク。美味しくはない", apply: (s) => addStamina(s, 60) },
  { id: "hellTraining", name: "地獄のメカニカルトレーニング", tier: "B", effect: "使用したターンの練習効果が2倍", desc: "伝説の教則本。速弾きを極めるならこれだ。", apply: (s) => setPracticeBuff(s, 2, 1) },
  { id: "baaaan", name: "BAAAAN!!", tier: "B", effect: "使用すると音楽センス+4", desc: "メタラーの愛読書。どれどれ、今月の表紙はだれかな？", apply: (s) => addParam(s, "S", 4) },
  { id: "studJacket", name: "スタッズの付いた革ジャン", tier: "B", effect: "使用するとビジュ力+4", desc: "これを着ればモテモテ間違いなし！", apply: (s) => addParam(s, "V", 4) },
  { id: "boinKiller", name: "ボインキラー", tier: "B", effect: "使用したターンに休息を取ると体力が全回復する", desc: "エッチな本。", apply: (s) => { s.buffs.restFull = true; } },
  { id: "jackDaniels", name: "ジャックダミエルズ", tier: "B", effect: "使用したターンの練習効果が4倍になるが、親密度が-10する", desc: "飲まなきゃやってられねぇ", apply: (s) => { setPracticeBuff(s, 4, 1); addStaffIntimacy(s, -10); } },
  { id: "hyperMetronome", name: "ハイパーメトロノーム", tier: "A", effect: "使用すると演奏基礎+4、且つ使用したターンの練習効果が1.5倍", desc: "BPM300まで数えられるメトロノーム", apply: (s) => { addParam(s, "T", 4); setPracticeBuff(s, 1.5, 1); } },
  { id: "bloodLetter", name: "血まみれのファンレター", tier: "A", effect: "使用するとパフォーマンス+10、ただし体力が20減る", desc: "ボロボロの紙に血でこう書かれている。「一生推します」", appearReq: (s) => bandAvg(s, "V") >= 50 && s.totalFans >= 4000, apply: (s) => { addParam(s, "P", 10); addStamina(s, -20); } },
  { id: "silentGuitar", name: "サイレントギター", tier: "A", effect: "使用するとそのターンから3ターンの間練習効果が2倍", desc: "これで夜中も練習し放題！", apply: (s) => setPracticeBuff(s, 2, 3) },
  { id: "starStrings", name: "星の弦", tier: "A", effect: "使用したターンにライブをすると動員数が満員になるが満足度は-30される", desc: "人気になるってのは、それはそれで大変だよな", appearReq: (s) => s.rank === "major" && bandAvg(s, "V") >= 50, apply: (s) => { s.buffs.liveSellout = true; s.buffs.liveSat -= 30; } },
  { id: "batThing", name: "例のコウモリ", tier: "S", effect: "使用したターンにライブがある場合、顧客満足度が+40", desc: "コウモリの人形を食べるパフォーマンスのはずが本物のコウモリだったんだよ", apply: (s) => { s.buffs.liveSat += 40; } },
  { id: "whitePowder", name: "白い粉", tier: "S", effect: "使用したターンに作成した曲の完成度が95になる、ただし体力が0になり親密度も-20になる", desc: "危険な粉。すべてを差し出す覚悟はあるか？", apply: (s) => { s.buffs.composeQ95 = true; s.members.forEach((m) => (m.stamina = 0)); addStaffIntimacy(s, -20); } },
  { id: "metalGodProof", name: "メタルゴッドの証", tier: "S", effect: "使用すると演奏基礎、パフォーマンス、音楽センス、ビジュ力が+30され、総ファン数が2倍になる", desc: "メタルゴッドはすべてのメタルバンドを愛している", appearReq: (s) => s.stage >= 4, apply: (s) => { (["T", "P", "S", "V"] as Param[]).forEach((p) => addParam(s, p, 30)); s.totalFans *= 2; } },
];

const ITEM_BY_ID: Record<string, ItemDef> = Object.fromEntries(ITEMS.map((i) => [i.id, i]));
export const itemDef = (id: string): ItemDef | undefined => ITEM_BY_ID[id];

/** Clear turn-scoped buffs and tick down multi-turn practice buffs. */
export function tickTurnBuffs(state: GameState): void {
  state.buffs.restFull = false;
  state.buffs.composeQ95 = false;
  if (state.buffs.practiceTurns > 0) {
    state.buffs.practiceTurns -= 1;
    if (state.buffs.practiceTurns <= 0) state.buffs.practiceMult = 1;
  } else {
    state.buffs.practiceMult = 1;
  }
}

/** Use an owned item (mutates). Returns the item name, or null if none. */
export function useItem(state: GameState, id: string): string | null {
  if ((state.items[id] ?? 0) <= 0) return null;
  const def = ITEM_BY_ID[id];
  if (!def) return null;
  state.items[id] -= 1;
  def.apply(state);
  pushLog(state, `アイテム使用：${def.name}`);
  return def.name;
}

/** 30% after an action: roll a tier (S2/A18/B80), then a random eligible item. */
export function maybeFindItem(state: GameState, rng: () => number = Math.random): Scene[] | null {
  if (rng() >= 0.25) return null; // ~1 drop per month (4 actions)
  const r = rng();
  const tier = r < 0.02 ? "S" : r < 0.2 ? "A" : "B";
  const pool = ITEMS.filter((i) => i.tier === tier && (!i.appearReq || i.appearReq(state)));
  if (pool.length === 0) return null;
  const item = pool[Math.floor(rng() * pool.length)];
  state.items[item.id] = (state.items[item.id] ?? 0) + 1;
  pushLog(state, `🎁 アイテム発見：${item.name}（${item.tier}）`);
  return itemFindScenes(item.tier, item.name, item.effect, rng);
}

/**
 * Advance past the just-resolved action. Returns "live" if the month's
 * action turns are done (time for the month-end live), else "board".
 */
export function advanceTurn(state: GameState, rng: () => number = Math.random): "live" | "board" {
  if (state.turn >= state.turnsPerMonth) return "live";
  state.turn += 1;
  tickTurnBuffs(state);
  dealHand(state, rng);
  return "board";
}

/** Reset for a new month: age songs, decay practice, recover a little. */
export function startNewMonth(state: GameState, rng: () => number = Math.random): void {
  state.month += 1;
  state.turn = 1;
  state.practiceFreshness = Math.max(0, state.practiceFreshness - 30);
  for (const s of state.songs) s.age += 1;
  // Tighter bands recover a little better between months (bond payoff).
  const recover = 6 + Math.round(state.bond * 0.1);
  for (const m of state.members) m.stamina = Math.min(100, m.stamina + recover);
  // Staff intimacy cools over time; anyone at zero walks out (defection).
  for (const st of state.staff) st.intimacy = Math.max(0, st.intimacy - 6);
  const leaving = state.staff.filter((st) => st.intimacy <= 0);
  if (leaving.length) {
    state.staff = state.staff.filter((st) => st.intimacy > 0);
    for (const st of leaving) pushLog(state, `${STAFF_LABEL[st.role]}が離脱した…（親密度が尽きた）`);
  }
  tickTurnBuffs(state);
  dealHand(state, rng);
  pushLog(state, `--- ${state.month}ヶ月目 スタート ---`);
}

// --- Milestone ladder & game over (checkpoints) -----------------------------

export interface Milestone {
  id: string;
  label: string;
  deadline: number; // must be cleared by this month, else disband
  req: { power?: number; fans?: number; songs?: number; bond?: number; fame?: number };
  bg: BgKey;
  flavor: string; // shown on achievement
  intro: string; // shown when this milestone becomes the next target
}

/** Band "演奏力" = mean of every member's T/P/S/V. */
export const bandPower = (s: GameState): number => {
  const per = s.members.map((m) => (m.T + m.P + m.S + m.V) / 4);
  return Math.round(per.reduce((a, b) => a + b, 0) / (per.length || 1));
};

export const MILESTONES: Milestone[] = [
  { id: "gateway", label: "アマチュア登竜門ライブ", deadline: 8, req: { power: 52, fans: 1600 }, bg: "venueSmall", flavor: "登竜門ライブを勝ち抜いた！シーンに名前が知れ渡る。", intro: "アマチュアバンドの登竜門ライブ。ここに立てなければ話にならない。まずは演奏力を鍛え、動員できるファンを集めろ。" },
  { id: "indiefes", label: "インディーズメタルフェス", deadline: 15, req: { power: 58, fans: 3200, songs: 3 }, bg: "venueBig", flavor: "インディーズフェスのステージへ！観客の規模が跳ね上がる。", intro: "インディーズメタルフェスからのオファーを掴む。より高い演奏力とファンに加え、武器となる楽曲の数（曲数）も問われる。" },
  { id: "major", label: "メジャーデビュー", deadline: 24, req: { power: 66, fans: 6000, bond: 50 }, bg: "venueBig", flavor: "メジャーデビュー決定！大箱ライブとサポート招致が解禁。ここからが本当の勝負だ。", intro: "夢の入り口、メジャーデビュー。実力とファンはもちろん、ここまで来たバンドの結束が試される。" },
  { id: "bigfes", label: "大型フェスのオファー", deadline: 36, req: { power: 74, fans: 14000, fame: 64 }, bg: "venueBig", flavor: "大型フェスのメインステージへ大抜擢！", intro: "大型フェスのメインステージ。圧倒的な演奏力と、広く届く知名度がものを言う。" },
  { id: "overseas", label: "海外進出", deadline: 50, req: { power: 80, fans: 36000, fame: 78 }, bg: "venueBig", flavor: "ついに海外へ——世界がバンドを待っている！", intro: "最終目標、海外進出。世界に通用する実力・知名度・そして膨大なファン。全てを頂点まで引き上げろ。" },
];

/** Summarize a milestone's requirements as "演奏力55・ファン2,000" for text. */
function reqSummary(m: Milestone): string {
  return (Object.keys(m.req) as (keyof Milestone["req"])[])
    .map((k) => `${REQ_LABEL[k]}${(m.req[k] ?? 0).toLocaleString()}`)
    .join("・");
}

/** Opening monologue centered on the chosen leader (played after part select). */
// --- リーダー個別ストーリー（パート＝選択キャラごとの物語）-------------------
// 大枠（関門）は共通。開始時のバックストーリーと、各関門突破時の個別ビートで、
// 選んだメンバーの性格・パート・過去を掘り下げる。他メンバーは固定名で登場。

/** A one-character scene with a mood + speaker tag. */
const solo = (state: GameState, bg: BgKey, art: string, mood: Mood, text: string, fx?: Scene["fx"]): Scene => ({
  bg, chars: [{ member: art, pos: "center", mood }], speaker: nameOf(state, art), text, fx,
});

/** Per-part opening backstory (2 scenes). Leader = L, display name = nm. */
const LEADER_INTRO: Record<string, (s: GameState, L: string, nm: string) => Scene[]> = {
  Vo: (s, L, nm) => [
    solo(s, "venueSmall", L, "fired", `——幼い頃、親に連れて行かれた小さなライブハウス。腹の底を殴るような轟音に、${nm}の心臓は鷲掴みにされた。`, "flash"),
    solo(s, "street", L, "normal", "勉強も運動も、からっきし。でもいい。あたしにはメタルがある。この内臓に響くデスボイスで、世界をぶっ叩く。それだけだ。"),
  ],
  Gt: (s, L, nm) => [
    solo(s, "studio", L, "normal", `——音楽一家に生まれ、物心つく前から楽器を握らされてきた。ピアノも、ヴァイオリンも。だが${nm}の心を灼いたのは、歪んだギターだった。`, "flash"),
    solo(s, "studio", L, "fired", "「メタルなんて」と親族は眉をひそめる。……上等だ。速弾きで黙らせてやる。有名になんてならなくていい。俺は、俺の理想の音を追う。"),
  ],
  Ba: (s, L, nm) => [
    solo(s, "studio", L, "normal", `——軽音部で組んだバンド。人が足りなくて、ギター志望だった${nm}が渋々握ったのがベースだった。`, "flash"),
    solo(s, "studio", L, "happy", "……なのに今は、この低音がたまらなく愛おしい。売れなくてもいい。ただ、この仲間と、ずっと長くバンドを続けたい。それだけ。"),
  ],
  Dr: (s, L) => [
    solo(s, "street", L, "happy", "——元・陸上部。ある日RISAに「速く走るにはドラムを練習するといい」と誘われて、あたしはこの世界に飛び込んだ！", "flash"),
    solo(s, "studio", L, "fired", "メタル？ 正直よく分かんない！ でも叩くのは超楽しいし、体力には自信あり！ ……ところでこれ、ほんとに足、速くなるんだよね？"),
  ],
};

/** Build the chosen leader's backstory intro (falls back to a generic line). */
export function buildLeaderIntro(state: GameState): Scene[] {
  const L = leaderArt(state);
  const nm = nameOf(state, L);
  const build = LEADER_INTRO[state.leaderPart];
  return build ? build(state, L, nm) : [solo(state, "street", L, "normal", `——${nm}。歪んだ轟音だけが、生きる証だ。`, "flash")];
}

/** Per-part story beat fired when a checkpoint is cleared (keyed by its id). */
const LEADER_ARC: Record<string, Record<string, (s: GameState, L: string, nm: string) => Scene[]>> = {
  Vo: {
    gateway: (s, L) => [
      solo(s, "backstage", L, "normal", "打ち上げの喧騒が引いて、一人になった瞬間——ふっと、静けさが刺さる。（……にぎやかにしてないと、寂しさに飲まれそうになるんだ）"),
      solo(s, "studio", "MIO", "happy", "「……RISA。次のスタジオ、いつもの時間でいい？」何気ないその一言に、少しだけ救われる。"),
    ],
    indiefes: (s, L) => [
      solo(s, "backstage", L, "happy", "大事なライブ前だってのに、RISAはご機嫌で酒瓶を掲げている。「かたいこと言うなって〜！」……止める？"),
      {
        bg: "backstage", chars: [{ member: L, pos: "center", mood: "normal" }],
        text: "Voはコンディションが命。でも、酒は彼女の相棒でもある——どうする？",
        choices: [
          { label: "「今日は喉を守れ」と止める", apply: (st) => { addStamina(st, 8); addLove(st, L, 2); pushLog(st, "個別STORY：RISAの喉を守った（体力+8・愛情度+2）"); },
            next: [solo(s, "backstage", L, "normal", "「ちぇ〜っ、真面目か。……まあ、あんたがそう言うなら。」渋々ボトルを置いた。（体力+8・愛情度+2）", "flash")] },
          { label: "「今日くらい付き合う」", apply: (st) => { addStamina(st, -6); addLove(st, L, 6); st.bond = Math.min(100, st.bond + 5); pushLog(st, "個別STORY：RISAと飲み明かした（愛情度+6・結束+5・体力-6）"); },
            next: [solo(s, "backstage", L, "happy", "「そうこなくっちゃ！ 今夜はとことん付き合えよ〜！」笑い声が夜に溶ける。（愛情度+6・結束+5・体力-6）", "flash")] },
        ],
      },
    ],
    major: (s, L) => [
      solo(s, "studio", "MIO", "sad", "メジャーデビュー直後。スーツの男がRISAに名刺を差し出した。「君、ソロでやる気はないか？ もっと売れるよ」"),
      {
        bg: "studio", chars: [{ member: L, pos: "center", mood: "normal" }],
        text: "RISAがこちらを見る。「……あんたは、どう思う？」——バンドの、リーダーとして。",
        choices: [
          { label: "「お前の居場所はここだ」と引き止める", apply: (st) => { st.bond = Math.min(100, st.bond + 12); addLove(st, L, 8); pushLog(st, "個別STORY：RISAはバンドを選んだ（結束+12・愛情度+8）"); },
            next: [solo(s, "backstage", L, "happy", "「……だよな。あたしもそう思ってた。」名刺を破り捨て、にっと笑う。「あたしの声は、この四人のためにある。」（結束+12・愛情度+8）", "flash")] },
          { label: "「翼を広げてみろ」と背中を押す", apply: (st) => { st.fame = Math.min(100, st.fame + 3); addLove(st, L, 5); st.bond = Math.max(0, st.bond - 6); pushLog(st, "個別STORY：RISAはソロも少し経験（知名度+3・愛情度+5・結束-6）"); },
            next: [solo(s, "street", L, "normal", "「……ちょっとだけ、外の風も浴びてくる。でも、帰る場所はここだからな。」少しの寂しさと、確かな信頼。（知名度+3・愛情度+5・結束-6）", "flash")] },
        ],
      },
    ],
    bigfes: (s, L) => [
      solo(s, "venueBig", L, "happy", "満員の大観衆を前に、RISAはふと笑った。「……昔のあたしに教えてやりたいよ。お前、ちゃんと居場所を見つけるぞって。」\n\n寂しがり屋のフロントウーマンは、もう一人じゃない。", "flash"),
    ],
  },
  Gt: {
    gateway: (s, L) => [
      {
        bg: "backstage", chars: [{ member: L, pos: "center", mood: "sad" }],
        text: "初勝利のあとの取材。NAOはマイクを向けられ、露骨に固まっている。（……人前で喋るのは、苦手なんだ）どうする？",
        choices: [
          { label: "代わりに前へ出て、支える", apply: (st) => { addLove(st, L, 6); pushLog(st, "個別STORY：NAOをそっと支えた（愛情度+6）"); },
            next: [solo(s, "backstage", L, "normal", "「……助かった。」ぼそりと、でも確かに。人見知りの天才が、少しだけ肩の力を抜いた。（愛情度+6）", "flash")] },
          { label: "「お前の言葉で話せ」と促す", apply: (st) => { addParam(st, "S", 1); addLove(st, L, 3); pushLog(st, "個別STORY：NAOが自分の言葉で語った（センス+1・愛情度+3）"); },
            next: [solo(s, "backstage", L, "fired", "「……俺の音楽は、俺の言葉だ。」たどたどしくも、芯のある一言。少し、殻が破れた。（センス+1・愛情度+3）", "flash")] },
        ],
      },
    ],
    indiefes: (s, L) => [
      solo(s, "studio", L, "sad", "楽屋にNAO宛ての手紙。差出人は親族——「いつまでそんな騒音を。そろそろ目を覚ましなさい」。NAOの手が、微かに震えている。"),
      {
        bg: "studio", chars: [{ member: L, pos: "center", mood: "normal" }],
        text: "音楽一家に生まれ、メタルを選んだことがずっと彼女のコンプレックスだ。どう声をかける？",
        choices: [
          { label: "「音で黙らせてやれ」と焚きつける", apply: (st) => { addParam(st, "S", 1); addLove(st, L, 3); pushLog(st, "個別STORY：NAOに火がついた（センス+1・愛情度+3）"); },
            next: [solo(s, "studio", L, "fired", "「……ああ。俺の速弾きが、本物だって証明してやる。」瞳に、静かな炎。（センス+1・愛情度+3）", "flash")] },
          { label: "「気にするな。俺たちが家族だ」", apply: (st) => { addLove(st, L, 6); st.bond = Math.min(100, st.bond + 4); pushLog(st, "個別STORY：NAOに寄り添った（愛情度+6・結束+4）"); },
            next: [solo(s, "studio", L, "happy", "「……そう、だな。ここが、俺の居場所か。」手紙をそっと畳んだ。（愛情度+6・結束+4）", "flash")] },
        ],
      },
    ],
    major: (s, L) => [
      solo(s, "studio", "RYO", "sad", "メジャーの担当が言う。「もっとキャッチーに。速弾きは減らして、売れる曲を」。NAOの眉がぴくりと動いた。"),
      {
        bg: "studio", chars: [{ member: L, pos: "center", mood: "normal" }],
        text: "有名になることより、理想の音を追ってきた天才肌。その理想を、曲げさせるか？",
        choices: [
          { label: "「理想を貫け。それがお前だ」", apply: (st) => { addParam(st, "S", 2); addLove(st, L, 8); pushLog(st, "個別STORY：NAOは理想を貫いた（センス+2・愛情度+8）"); },
            next: [solo(s, "studio", L, "fired", "「……ありがとう。俺は、俺の音でてっぺんを獲る。」迷いが消えた指先が、加速する。（センス+2・愛情度+8）", "flash")] },
          { label: "「売れ線も、武器のうちだ」", apply: (st) => { st.fame = Math.min(100, st.fame + 4); addLove(st, L, 2); st.bond = Math.max(0, st.bond - 3); pushLog(st, "個別STORY：NAOは折り合いをつけた（知名度+4・愛情度+2・結束-3）"); },
            next: [solo(s, "studio", L, "normal", "「……一理ある。理想も、届かなきゃ意味がない、か。」複雑な顔で、新しい譜面を睨む。（知名度+4・愛情度+2・結束-3）", "flash")] },
        ],
      },
    ],
    bigfes: (s, L) => [
      solo(s, "venueBig", L, "happy", "客席の隅に、あの親族の姿。演奏後、彼らは何も言わず、ただ深く頷いて帰っていった。\n\n「……認めさせた、のかな。」NAOの横顔が、憑き物が落ちたように穏やかだった。", "flash"),
    ],
  },
  Ba: {
    gateway: (s, L) => [
      solo(s, "street", L, "happy", "MAKOのインディーズ知識が火を噴く。「あのハコの店長、昔◯◯ってバンドで…」——マニアックな縁が、思わぬ対バンを呼び込んだ。（人脈+1）"),
      { bg: "street", chars: [{ member: L, pos: "center", mood: "normal" }], text: "地味だが、彼女の愛と知識がバンドを一歩前へ進めた。", fx: "flash", choices: undefined },
    ],
    indiefes: (s, L) => [
      solo(s, "studio", L, "sad", "ふとしたとき、MAKOがぽつりと零す。「……あたし、売れなくてもいい。ただ、このバンドが、いつか終わっちゃうのが、こわい」"),
      {
        bg: "studio", chars: [{ member: L, pos: "center", mood: "normal" }],
        text: "一番バンドにかける思いが強い、内気なベーシスト。何と返す？",
        choices: [
          { label: "「ずっと一緒だ。約束する」", apply: (st) => { st.bond = Math.min(100, st.bond + 10); addLove(st, L, 8); pushLog(st, "個別STORY：MAKOと約束を交わした（結束+10・愛情度+8）"); },
            next: [solo(s, "studio", L, "happy", "「……うん。うん。指切り、して？」小さな小指が差し出される。ずっと、この音を。（結束+10・愛情度+8）", "flash")] },
          { label: "「先は分からない。でも今を全力で」", apply: (st) => { addLove(st, L, 4); st.bond = Math.min(100, st.bond + 4); pushLog(st, "個別STORY：MAKOと今を誓った（愛情度+4・結束+4）"); },
            next: [solo(s, "studio", L, "normal", "「……そうだね。今を、ちゃんと刻もう。」少し寂しげに、でも確かに頷いた。（愛情度+4・結束+4）", "flash")] },
        ],
      },
    ],
    major: (s, L) => [
      solo(s, "venueBig", L, "sad", "規模が大きくなるほど、MAKOは不安げだ。「……大きくなると、みんな、変わっちゃうのかな」"),
      {
        bg: "studio", chars: [{ member: L, pos: "center", mood: "normal" }],
        text: "売れることより、このメンバーで長く。彼女の願いに、どう応える？",
        choices: [
          { label: "「何があっても、この五人で行く」", apply: (st) => { st.bond = Math.min(100, st.bond + 12); addLove(st, L, 8); pushLog(st, "個別STORY：MAKOに絆を誓った（結束+12・愛情度+8）"); },
            next: [solo(s, "studio", L, "happy", "「……えへへ。じゃあ、あたし、どこまでもついていく。」不安が、笑顔にほどけた。（結束+12・愛情度+8）", "flash")] },
          { label: "「大きくなるのも、悪くないぞ」", apply: (st) => { st.fame = Math.min(100, st.fame + 4); st.bond = Math.max(0, st.bond - 4); addLove(st, L, 1); pushLog(st, "個別STORY：規模拡大を優先（知名度+4・結束-4）"); },
            next: [solo(s, "street", L, "sad", "「……うん、わかってる。ついていく、けど。」少しだけ、俯いた。（知名度+4・結束-4）")] },
        ],
      },
    ],
    bigfes: (s, L) => [
      solo(s, "venueBig", L, "happy", "大観衆の中、MAKOがはにかんで叫んだ。「あたし、このバンドが世界で一番好き——ッ！」\n\n内気な彼女の、精一杯の愛の告白。四人の音が、一つに溶けていく。", "flash"),
    ],
  },
  Dr: {
    gateway: (s, L) => [
      solo(s, "backstage", L, "sad", "登竜門ライブ直前。天真爛漫なTOMOが、ガチガチに固まっている。「む、無理かも……人がいっぱい……」——実は、極度の上がり性なのだ。"),
      {
        bg: "backstage", chars: [{ member: L, pos: "center", mood: "normal" }],
        text: "本番はもう目前。どう送り出す？",
        choices: [
          { label: "深呼吸させて、落ち着かせる", apply: (st) => { addStamina(st, 6); addLove(st, L, 6); pushLog(st, "個別STORY：TOMOを落ち着かせた（体力+6・愛情度+6）"); },
            next: [solo(s, "backstage", L, "happy", "「……すぅ、はぁ。……うん、いける気がしてきた！ ありがと！」いつもの笑顔が戻った。（体力+6・愛情度+6）", "flash")] },
          { label: "「陸上の本番と同じだ、走れ！」", apply: (st) => { addParam(st, "P", 2); addLove(st, L, 3); pushLog(st, "個別STORY：TOMOに気合が入った（パフォーマンス+2・愛情度+3）"); },
            next: [solo(s, "backstage", L, "fired", "「……っ、そうだ、スタートの合図と同じ！ よぉし、走るよ——ッ!!」スティックを握り直す。（パフォーマンス+2・愛情度+3）", "flash")] },
        ],
      },
    ],
    indiefes: (s, L) => [
      solo(s, "venueSmall", L, "happy", "客席にTOMOの友達がぎっしり。「TOMO——ッ！」の声援が飛ぶ。誰とでも仲良くなれる彼女の人徳が、会場を温めた。（知名度が広がった）", "flash"),
    ],
    major: (s, L) => [
      solo(s, "street", "RYO", "normal", "陸上のコーチがTOMOを訪ねてきた。「君、まだ間に合う。オリンピックを本気で狙わないか」——TOMOの夢は、メダルだ。"),
      {
        bg: "studio", chars: [{ member: L, pos: "center", mood: "normal" }],
        text: "（そういえば、あたし『走るためにドラム』始めたんだっけ…）バンドか、陸上か。彼女の背中を、どう押す？",
        choices: [
          { label: "「両方の夢、応援するよ」", apply: (st) => { addLove(st, L, 10); st.bond = Math.min(100, st.bond + 3); pushLog(st, "個別STORY：TOMOの両夢を応援（愛情度+10・結束+3）"); },
            next: [solo(s, "studio", L, "happy", "「……ほんと！？ えへへ、あたし、欲張りでもいいんだ！ ドラムも走るのも、全部やる——ッ！」（愛情度+10・結束+3）", "flash")] },
          { label: "「今は、バンドに集中してほしい」", apply: (st) => { st.bond = Math.min(100, st.bond + 8); addLove(st, L, -2); pushLog(st, "個別STORY：TOMOにバンド集中を頼んだ（結束+8・愛情度-2）"); },
            next: [solo(s, "studio", L, "sad", "「……うん、わかった。今は、みんなとが一番だもんね。」笑顔の奥に、ほんの少しの迷い。（結束+8・愛情度-2）")] },
        ],
      },
    ],
    bigfes: (s, L) => [
      solo(s, "venueBig", L, "happy", "大歓声の中、TOMOがからっと笑う。「あたし、そろそろ気づいちゃった。ドラム、たぶん足は速くならない！ でも——こんなに好きになれたんだから、ぜんぜんアリ！」\n\n嘘から始まった夢が、本物になった瞬間。", "flash"),
    ],
  },
};

/** Story beat for the chosen leader when checkpoint `clearedId` is cleared. */
export function buildLeaderStoryBeat(state: GameState, clearedId: string): Scene[] {
  const build = LEADER_ARC[state.leaderPart]?.[clearedId];
  if (!build) return [];
  return build(state, leaderArt(state), nameOf(state, leaderArt(state)));
}

export function buildOpeningScenes(state: GameState): Scene[] {
  return [
    ...buildLeaderIntro(state),
    scene("studio", ["KEN", "RYO", "MIO", "GO"], "仲間はいる。時間も金も、いつだって足りない。それでも今日も、あたしたちはスタジオに集まる。\n\n——さあ、伝説を始めよう。", { fx: "shake" }),
  ];
}

/** Tutorial: the band explains which action raises which stat. */
export function buildTutorialScenes(): Scene[] {
  return [
    scene("studio", ["KEN"], "【遊び方】まずは行動だ。毎ターン、手札から行動を選ぶ。\n\n『音楽活動＞練習』で演奏力（T/P/S/V）が上がる。『作曲』で曲数が増え、『パフォーマンス』でファンが増える。", { speaker: "KEN" }),
    scene("studio", ["RYO"], "『広報活動』はファンと知名度をじわじわ伸ばす。ライブの動員に効いてくるぜ。", { speaker: "RYO" }),
    scene("studio", ["MIO"], "『関係性構築』は人脈と結束を育てる。人脈が貯まればサポート陣を招け、結束は回復や親密度に効く。", { speaker: "MIO" }),
    scene("studio", ["GO"], "『アルバイト』で資金稼ぎ。ライブの会場費はこれで払う。そして『休息』で体力回復——体力が尽きると休息しか選べなくなるから注意な！", { speaker: "GO" }),
    scene("venueSmall", ["KEN", "RYO", "MIO", "GO"], "そして『関門』。期限までに条件（演奏力・ファン・曲数・結束・知名度など）を満たせば次のステージへ。\n\n間に合わなければ……解散だ。画面上部のチェックリストを見て、足りない数値を伸ばしていけ！", { fx: "flash" }),
  ];
}

/** Milestone intro: protagonist + band get hyped for the next checkpoint. */
export function buildMilestoneIntro(state: GameState, m: Milestone): Scene[] {
  const L = leaderArt(state);
  const name = nameOf(state, L);
  return [
    scene(m.bg, ["KEN", "RYO", "MIO", "GO"], `【次の関門】${m.label}\n\n${m.intro}`, { speaker: name }),
    scene("studio", [L], `期限は${m.deadline}ヶ月目。条件は ${reqSummary(m)}。\n\n——やってやる。次のステージへ、駆け上がるぞ。`, { fx: "flash" }),
  ];
}

/** Full intro sequence after part select: monologue + tutorial + first goal. */
export function buildIntroSequence(state: GameState): Scene[] {
  const first = MILESTONES[state.stage];
  return [...buildOpeningScenes(state), ...buildTutorialScenes(), ...(first ? buildMilestoneIntro(state, first) : [])];
}

/** Current value of a requirement key (for the checklist). */
export function reqValue(s: GameState, key: keyof Milestone["req"]): number {
  switch (key) {
    case "power": return bandPower(s);
    case "fans": return s.totalFans;
    case "songs": return s.songs.length;
    case "bond": return Math.round(s.bond);
    case "fame": return Math.round(s.fame);
  }
  return 0;
}

export const REQ_LABEL: Record<keyof Milestone["req"], string> = {
  power: "演奏力", fans: "ファン", songs: "曲数", bond: "結束", fame: "知名度",
};

const reqMet = (s: GameState, req: Milestone["req"]): boolean =>
  (Object.keys(req) as (keyof Milestone["req"])[]).every((k) => reqValue(s, k) >= (req[k] ?? 0));

/** The milestone the band is currently working toward (undefined = all cleared). */
export const currentMilestone = (s: GameState): Milestone | undefined => MILESTONES[s.stage];

export type ProgressResult =
  | { kind: "none" }
  | { kind: "advance" | "clear"; milestone: Milestone; scenes: Scene[] }
  | { kind: "gameover"; milestone: Milestone };

/**
 * Evaluate the current checkpoint at a month boundary: advance if its
 * conditions are met, disband if its deadline has passed unmet, else continue.
 */
export function checkProgress(state: GameState): ProgressResult {
  const target = MILESTONES[state.stage];
  if (!target) return { kind: "none" };
  if (reqMet(state, target.req)) {
    state.stage += 1;
    if (target.id === "major") state.rank = "major";
    pushLog(state, `★ ${target.label} 達成！`);
    const cleared = state.stage >= MILESTONES.length;
    const next = MILESTONES[state.stage];
    const scenes: Scene[] = [
      scene(target.bg, ["KEN", "RYO", "MIO", "GO"], `【${target.label}】達成！\n\n${target.flavor}`, { fx: "flash" }),
      // the chosen leader's personal arc advances at each checkpoint
      ...buildLeaderStoryBeat(state, target.id),
      // when a new checkpoint appears, introduce it and hype the band up
      ...(!cleared && next ? buildMilestoneIntro(state, next) : []),
    ];
    return { kind: cleared ? "clear" : "advance", milestone: target, scenes };
  }
  if (state.month > target.deadline) {
    pushLog(state, `${target.label} の期限（${target.deadline}ヶ月目）を過ぎた…。バンドは解散した。`);
    return { kind: "gameover", milestone: target };
  }
  return { kind: "none" };
}

export function pushLog(state: GameState, msg: string): void {
  state.log.unshift(msg);
  if (state.log.length > 40) state.log.pop();
}

/** Display name for a sprite key (leader may be renamed). */
export function nameOf(state: GameState, artKey: string): string {
  return state.members.find((m) => m.artKey === artKey)?.name ?? artKey;
}
