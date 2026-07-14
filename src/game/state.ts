// Game state, the per-turn action-card hand, and action resolution.
// Progression is a monthly loop: turnsPerMonth action cards, then a live.
// See docs/phase1-cards.md.

import { bandParam } from "./coreLoop";
import { buildPracticeScenes } from "./narrative";
import type {
  ActionCard,
  ActionKind,
  BgKey,
  GameState,
  Member,
  Param,
  Scene,
  Song,
  StaffRole,
} from "./types";
import { PARAM_LABEL, STAFF_LABEL } from "./types";

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
    { name: "RYO", artKey: "RYO", part: "Vo", isLeader: false, T: 48, P: 60, S: 52, V: 58, stamina: 100 },
    { name: "KEN", artKey: "KEN", part: "Gt", isLeader: false, T: 64, P: 50, S: 55, V: 46, stamina: 100 },
    { name: "MIO", artKey: "MIO", part: "Ba", isLeader: false, T: 58, P: 46, S: 50, V: 44, stamina: 100 },
    { name: "GO", artKey: "GO", part: "Dr", isLeader: false, T: 62, P: 44, S: 42, V: 40, stamina: 100 },
  ];
}

/** Which existing member plays a given part. */
const PART_TO_ART: Record<string, string> = { Vo: "RYO", Gt: "KEN", Ba: "MIO", Dr: "GO" };
export const PARTS: { part: string; label: string }[] = [
  { part: "Vo", label: "ボーカル" },
  { part: "Gt", label: "ギター" },
  { part: "Ba", label: "ベース" },
  { part: "Dr", label: "ドラム" },
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
      return resolveRest(state, subId ?? "full");
    case "music":
      return resolveMusic(state, subId ?? "practice", param, rng);
    case "promo":
      return resolvePromo(state);
    case "network":
      return resolveNetwork(state, subId ?? "band");
    case "money":
      return resolveMoney(state, rng);
  }
}

function resolveRest(state: GameState, sub: string): { scenes: Scene[] } {
  const L = leaderArt(state);
  if (sub === "study") {
    addStamina(state, 12);
    addParam(state, "S", 1);
    pushLog(state, "社会勉強：見聞を広げた（体力+12 / センス+1）");
    return { scenes: [scene("studio", [L], "図書館やニュースで世の中を学んだ。歌詞の引き出しが増えた。\n\n体力 +12・音楽センス +1（全員）", { fx: "flash" })] };
  }
  if (sub === "hobby") {
    addStamina(state, 26);
    addParam(state, "V", 1);
    pushLog(state, "趣味に没頭：リフレッシュ（体力+26 / ビジュ+1）");
    return { scenes: [scene("street", [L], "好きなことに没頭してリフレッシュ。スタイルの幅も広がった。\n\n体力 +26・ビジュ力 +1（全員）", { fx: "flash" })] };
  }
  addStamina(state, 40);
  pushLog(state, "完全休養：しっかり休んだ（体力+40）");
  return { scenes: [scene("backstage", [L], "今日はしっかり休養。英気を養った。\n\n体力 +40（全員）", { fx: "flash" })] };
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
    const Q = Math.max(20, Math.min(95, Math.round(0.7 * s + rng() * 20 + pQ)));
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
    return {
      scenes: [
        scene("studio", ["KEN", "RYO"], "新しいリフが降ってきた。夜通しアレンジを詰める。", { speaker: "KEN", fx: "shake" }),
        scene("studio", [leaderArt(state)], `新曲「${song.name}」が完成した！（Q${Q}）\n\n新曲はしばらく知名度とファンを引っぱってくれる。`, { fx: "flash" }),
      ],
    };
  }
  if (sub === "perform") {
    addParam(state, "P", 2);
    const f = 6 + Math.floor(rng() * 8);
    state.segFans.light += f;
    state.totalFans += f;
    state.fame = Math.min(100, state.fame + 1);
    spend(state, 14);
    pushLog(state, `パフォーマンス特訓：ステージ度胸UP（P+2 / ファン+${f}）`);
    return { scenes: [scene("street", ["RYO"], `路上でゲリラ演奏。人だかりができた。\n\nパフォーマンス +2・ファン +${f}`, { speaker: "RYO", fx: "shake" })] };
  }
  // practice — needs a param
  const p = param ?? "T";
  const gain = 6;
  addParam(state, p, gain);
  spend(state, 16);
  state.practiceFreshness = 100;
  pushLog(state, `練習：${PARAM_LABEL[p]}を強化（+${gain} / 全員）・練習の鮮度MAX`);
  return { scenes: buildPracticeScenes(p, gain) };
}

function resolvePromo(state: GameState): { scenes: Scene[] } {
  state.fame = Math.min(100, state.fame + 3);
  state.support.sn = Math.min(1, state.support.sn + 0.03);
  const f = 4 + Math.floor(state.fame / 10);
  state.segFans.light += f;
  state.totalFans += f;
  spend(state, 10);
  pushLog(state, `広報活動：SNS・宣伝を強化（知名度+3 / ファン+${f}）`);
  return { scenes: [scene("studio", [leaderArt(state)], `SNSやフライヤーで宣伝を打った。じわじわ認知が広がる。\n\n知名度 +3・SNS効果UP・ファン +${f}`, { fx: "flash" })] };
}

function resolveNetwork(state: GameState, sub: string): { scenes: Scene[] } {
  if (sub === "contact") {
    state.contacts += 1;
    state.support.mk = Math.min(1, state.support.mk + 0.03);
    state.fame = Math.min(100, state.fame + 1);
    spend(state, 10);
    pushLog(state, `新たな人脈：業界の知り合いが増えた（人脈+1 → ${state.contacts} / マーケ力・知名度↑）`);
    return { scenes: [scene("street", [leaderArt(state)], `対バン相手やハコの店長と繋がった。人脈は将来サポート陣を招く鍵になる。\n\n人脈 +1（計${state.contacts}）・マーケ力UP・知名度 +1`, { fx: "flash" })] };
  }
  state.bond = Math.min(100, state.bond + 8);
  addStamina(state, 12);
  // Time with the crew also warms up any hired staff (親密度).
  for (const st of state.staff) st.intimacy = Math.min(100, st.intimacy + 8);
  const staffNote = state.staff.length ? "・サポート陣との親密度も上昇" : "";
  pushLog(state, `バンド関係者との交流：結束が高まった（結束+8 → ${state.bond} / 体力+12${state.staff.length ? " / 親密度↑" : ""}）`);
  return { scenes: [scene("backstage", ["RYO", "KEN", "MIO", "GO"], `メンバーやスタッフと飲みに行き、本音をぶつけ合った。バンドの結束が高まる。\n\n結束 +8（計${state.bond}）・体力 +12（全員）${staffNote}`, { fx: "flash" })] };
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
  return { scenes: [scene("studio", [leaderArt(state)], `生活とバンド資金のためにバイト。${yen(amt)}を稼いだ。\n\nライブの会場費はここで貯める。`, { fx: "flash" })] };
}

/**
 * Advance past the just-resolved action. Returns "live" if the month's
 * action turns are done (time for the month-end live), else "board".
 */
export function advanceTurn(state: GameState, rng: () => number = Math.random): "live" | "board" {
  if (state.turn >= state.turnsPerMonth) return "live";
  state.turn += 1;
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
  flavor: string;
}

/** Band "演奏力" = mean of every member's T/P/S/V. */
export const bandPower = (s: GameState): number => {
  const per = s.members.map((m) => (m.T + m.P + m.S + m.V) / 4);
  return Math.round(per.reduce((a, b) => a + b, 0) / (per.length || 1));
};

export const MILESTONES: Milestone[] = [
  { id: "gateway", label: "アマチュア登竜門ライブ", deadline: 6, req: { power: 55, fans: 2000 }, bg: "venueSmall", flavor: "登竜門ライブを勝ち抜いた！シーンに名前が知れ渡る。" },
  { id: "indiefes", label: "インディーズメタルフェス", deadline: 12, req: { power: 62, fans: 4000, songs: 3 }, bg: "venueBig", flavor: "インディーズフェスのステージへ！観客の規模が跳ね上がる。" },
  { id: "major", label: "メジャーデビュー", deadline: 20, req: { power: 70, fans: 8000, bond: 55 }, bg: "venueBig", flavor: "メジャーデビュー決定！大箱ライブとサポート招致が解禁。ここからが本当の勝負だ。" },
  { id: "bigfes", label: "大型フェスのオファー", deadline: 30, req: { power: 78, fans: 20000, fame: 70 }, bg: "venueBig", flavor: "大型フェスのメインステージへ大抜擢！" },
  { id: "overseas", label: "海外進出", deadline: 42, req: { power: 85, fans: 50000, fame: 85 }, bg: "venueBig", flavor: "ついに海外へ——世界がバンドを待っている！" },
];

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
    const scenes: Scene[] = [
      scene(target.bg, ["KEN", "RYO", "MIO", "GO"], `【${target.label}】達成！\n\n${target.flavor}`, { fx: "flash" }),
    ];
    return { kind: state.stage >= MILESTONES.length ? "clear" : "advance", milestone: target, scenes };
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
