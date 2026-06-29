// Initial game state, board generation, and per-space / per-turn mechanics.

import type { EventDelta, EventOutcome, GameState, Member, Param, Space } from "./types";
import { PARAM_LABEL, PARAMS } from "./types";

const BOARD_LENGTH = 20; // spaces in one month; last is the live
const STAMINA_COST_PRACTICE = 8; // stamina spent when training
const PRACTICE_EXP = 100; // exp granted per practice landing (pre-condition)
const EXP_PER_POINT = 200; // exp needed to raise a param by 1

const yen = (n: number) => `¥${n.toLocaleString()}`;

/** The four founding members (Vo/Gt/Ba/Dr). */
function initialMembers(): Member[] {
  return [
    { name: "RYO", part: "Vo", T: 48, P: 60, S: 52, V: 58, stamina: 100, exp: 0 },
    { name: "KEN", part: "Gt", T: 64, P: 50, S: 55, V: 46, stamina: 100, exp: 0 },
    { name: "MIO", part: "Ba", T: 58, P: 46, S: 50, V: 44, stamina: 100, exp: 0 },
    { name: "GO", part: "Dr", T: 62, P: 44, S: 42, V: 40, stamina: 100, exp: 0 },
  ];
}

/**
 * Themed board. Non-fixed spaces stay hidden ("?") until landed on; the final
 * LIVE space is a fixed event that fires on pass-through.
 */
function buildBoard(rng: () => number): Space[] {
  const board: Space[] = [];
  const practiceCycle = [...PARAMS];
  for (let i = 0; i < BOARD_LENGTH - 1; i++) {
    const roll = rng();
    let space: Space;
    if (roll < 0.45) {
      const param = practiceCycle[i % practiceCycle.length];
      space = { kind: "practice", param, label: `${PARAM_LABEL[param]}練`, fixed: false, revealed: false };
    } else if (roll < 0.65) {
      space = { kind: "rest", label: "休息", fixed: false, revealed: false };
    } else if (roll < 0.78) {
      space = { kind: "money", label: "バイト", fixed: false, revealed: false };
    } else if (roll < 0.9) {
      space = { kind: "fan", label: "路上", fixed: false, revealed: false };
    } else {
      space = { kind: "event", label: "事件", fixed: false, revealed: false };
    }
    board.push(space);
  }
  board.push({ kind: "live", label: "LIVE", fixed: true, revealed: true });
  return board;
}

export function newGame(rng: () => number = Math.random): GameState {
  return {
    month: 1,
    members: initialMembers(),
    support: { mk: 0.2, sn: 0.15 },
    songs: [
      { name: "Iron Dawn", lean: { core: 0.55, light: 0.15, visual: 0.1, expert: 0.2 }, Q: 60 },
    ],
    funds: 300_000,
    totalFans: 1200,
    segFans: { core: 600, light: 300, visual: 150, expert: 150 },
    fame: 18,
    board: buildBoard(rng),
    pos: -1, // not yet on the board
    log: ["バンド「Metal Road」、活動開始！"],
  };
}

/** Reset the board for a new month (keeps band/fans/funds). */
export function startNewMonth(state: GameState, rng: () => number = Math.random): void {
  state.month += 1;
  state.board = buildBoard(rng);
  state.pos = -1;
  for (const m of state.members) m.stamina = Math.min(100, m.stamina + 30);
  pushLog(state, `--- ${state.month}ヶ月目 スタート ---`);
}

export function pushLog(state: GameState, msg: string): void {
  state.log.unshift(msg);
  if (state.log.length > 40) state.log.pop();
}

/** Roll a six-sided die. */
export function rollDice(rng: () => number = Math.random): number {
  return 1 + Math.floor(rng() * 6);
}

/**
 * Where the band lands after a dice roll. Fixed events fire on pass-through:
 * if one lies within the jump, the band stops on it. Otherwise it stops at
 * pos+roll (clamped to the board end).
 */
export function computeTarget(state: GameState, roll: number): number {
  const end = state.board.length - 1;
  const raw = Math.min(state.pos + roll, end);
  for (let i = state.pos + 1; i <= raw; i++) {
    if (state.board[i].fixed) return i;
  }
  return raw;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function condFactor(members: Member[]): number {
  return 0.82 + (0.18 * avg(members.map((m) => m.stamina))) / 100;
}

function grantExp(state: GameState, param: Param): EventDelta[] {
  const cond = condFactor(state.members);
  const gain = Math.round(PRACTICE_EXP * cond);
  let levels = 0;
  for (const m of state.members) {
    m.exp += gain;
    while (m.exp >= EXP_PER_POINT) {
      m.exp -= EXP_PER_POINT;
      if (m[param] < 99) {
        m[param] += 1;
        levels++;
      }
    }
    m.stamina = Math.max(0, m.stamina - STAMINA_COST_PRACTICE);
  }
  pushLog(state, `${PARAM_LABEL[param]}を練習（+${gain}exp / 全員）`);
  const deltas: EventDelta[] = [{ label: PARAM_LABEL[param], value: `+${gain}exp`, dir: "info" }];
  if (levels > 0) deltas.push({ label: `${PARAM_LABEL[param]} 能力`, value: `UP×${levels}`, dir: "up" });
  deltas.push({ label: "体力", value: `-${STAMINA_COST_PRACTICE}`, dir: "down" });
  return deltas;
}

/**
 * Apply the effect of the space the band landed on and return an outcome
 * describing what to animate.
 */
export function resolveSpace(
  state: GameState,
  space: Space,
  rng: () => number = Math.random,
): EventOutcome {
  switch (space.kind) {
    case "practice":
      return {
        icon: "🎸",
        title: `${PARAM_LABEL[space.param!]}を特訓！`,
        deltas: grantExp(state, space.param!),
        reachedLive: false,
      };
    case "rest": {
      for (const m of state.members) m.stamina = Math.min(100, m.stamina + 25);
      pushLog(state, "休息で体力回復（+25 / 全員）");
      return { icon: "💤", title: "ゆっくり休息…", deltas: [{ label: "体力", value: "+25", dir: "up" }], reachedLive: false };
    }
    case "money": {
      const amt = 20_000 + Math.floor(rng() * 30_000);
      state.funds += amt;
      pushLog(state, `バイトで${yen(amt)}稼いだ`);
      return { icon: "💴", title: "バイトでひと稼ぎ", deltas: [{ label: "資金", value: `+${yen(amt)}`, dir: "up" }], reachedLive: false };
    }
    case "fan": {
      const f = 10 + Math.floor(rng() * 20);
      state.segFans.core += f;
      state.totalFans += f;
      pushLog(state, `路上ライブでファン+${f}`);
      return { icon: "🔥", title: "路上ライブ決行！", deltas: [{ label: "ファン", value: `+${f}`, dir: "up" }], reachedLive: false };
    }
    case "event":
      return resolveEvent(state, rng);
    case "live":
      pushLog(state, "月末ライブ当日！");
      return { icon: "🎤", title: "月末ライブ当日！", deltas: [], reachedLive: true };
  }
}

/** Random band event. */
function resolveEvent(state: GameState, rng: () => number): EventOutcome {
  const r = rng();
  if (r < 0.4) {
    for (const m of state.members) m.exp += 60;
    pushLog(state, "スタジオで白熱したセッション！（全員 +60exp）");
    return { icon: "🎶", title: "白熱のスタジオセッション！", deltas: [{ label: "全員 経験点", value: "+60exp", dir: "up" }], reachedLive: false };
  }
  if (r < 0.7) {
    const amt = 15_000;
    state.funds = Math.max(0, state.funds - amt);
    pushLog(state, `機材トラブル… 修理に${yen(amt)}`);
    return { icon: "⚙️", title: "機材トラブル発生…", deltas: [{ label: "資金", value: `-${yen(amt)}`, dir: "down" }], reachedLive: false };
  }
  state.support.sn = Math.min(1, state.support.sn + 0.05);
  pushLog(state, "SNS投稿がプチバズ！（SNS効果アップ）");
  return { icon: "📱", title: "SNS投稿がプチバズ！", deltas: [{ label: "SNS効果", value: "UP", dir: "up" }], reachedLive: false };
}
