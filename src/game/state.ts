// Game state, the per-turn action-card hand, and action resolution.
// Progression is a monthly loop: turnsPerMonth action cards, then a live.
// See docs/phase1-cards.md.

import { bandParam } from "./coreLoop";
import { buildPracticeScenes } from "./narrative";
import type {
  ActionCard,
  ActionKind,
  GameState,
  Member,
  Param,
  Scene,
  Song,
} from "./types";
import { PARAM_LABEL } from "./types";

const TURNS_PER_MONTH = 4;
const clampStat = (n: number) => Math.max(0, Math.min(99, n));
const yen = (n: number) => `¥${n.toLocaleString()}`;

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
  const picks = pool.slice(0, 2);
  state.hand = [CARD.rest, ...picks.map((k) => CARD[k])];
}

// --- Action resolution ------------------------------------------------------

const forEachMember = (s: GameState, fn: (m: Member) => void) => s.members.forEach(fn);
const addStamina = (s: GameState, d: number) =>
  forEachMember(s, (m) => (m.stamina = Math.max(0, Math.min(100, m.stamina + d))));
const addParam = (s: GameState, p: Param, d: number) =>
  forEachMember(s, (m) => (m[p] = clampStat(m[p] + d)));

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
    const Q = Math.max(20, Math.min(95, Math.round(0.7 * s + rng() * 20)));
    const n = state.songs.length + 1;
    const song: Song = {
      name: `New Track ${n}`,
      lean: { core: 0.5, light: 0.2, visual: 0.1, expert: 0.2 },
      Q,
      age: 0,
    };
    state.songs.push(song);
    addStamina(state, -10);
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
    addStamina(state, -8);
    pushLog(state, `パフォーマンス特訓：ステージ度胸UP（P+2 / ファン+${f}）`);
    return { scenes: [scene("street", ["RYO"], `路上でゲリラ演奏。人だかりができた。\n\nパフォーマンス +2・ファン +${f}`, { speaker: "RYO", fx: "shake" })] };
  }
  // practice — needs a param
  const p = param ?? "T";
  const gain = 6;
  addParam(state, p, gain);
  addStamina(state, -10);
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
  addStamina(state, -4);
  pushLog(state, `広報活動：SNS・宣伝を強化（知名度+3 / ファン+${f}）`);
  return { scenes: [scene("studio", [leaderArt(state)], `SNSやフライヤーで宣伝を打った。じわじわ認知が広がる。\n\n知名度 +3・SNS効果UP・ファン +${f}`, { fx: "flash" })] };
}

function resolveNetwork(state: GameState, sub: string): { scenes: Scene[] } {
  if (sub === "contact") {
    state.support.mk = Math.min(1, state.support.mk + 0.03);
    state.fame = Math.min(100, state.fame + 1);
    addStamina(state, -4);
    pushLog(state, "新たな人脈：業界の知り合いが増えた（マーケ力・知名度↑）");
    return { scenes: [scene("street", [leaderArt(state)], "対バン相手やハコの店長と繋がった。人脈は将来の武器になる。\n\nマーケ力UP・知名度 +1", { fx: "flash" })] };
  }
  addStamina(state, 10);
  pushLog(state, "バンド関係者との交流：結束が高まった（体力+10）");
  return { scenes: [scene("backstage", ["RYO", "KEN", "MIO", "GO"], "メンバーで飲みに行き、本音をぶつけ合った。バンドの結束が高まる。\n\n体力 +10（全員）", { fx: "flash" })] };
}

function resolveMoney(state: GameState, rng: () => number): { scenes: Scene[] } {
  const amt = 60_000 + Math.floor(rng() * 40_000);
  state.funds += amt;
  addStamina(state, -6);
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
  for (const m of state.members) m.stamina = Math.min(100, m.stamina + 15);
  dealHand(state, rng);
  pushLog(state, `--- ${state.month}ヶ月目 スタート ---`);
}

export function pushLog(state: GameState, msg: string): void {
  state.log.unshift(msg);
  if (state.log.length > 40) state.log.pop();
}

/** Display name for a sprite key (leader may be renamed). */
export function nameOf(state: GameState, artKey: string): string {
  return state.members.find((m) => m.artKey === artKey)?.name ?? artKey;
}
