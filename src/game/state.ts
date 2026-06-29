// Initial game state, board generation, and per-space / per-turn mechanics.
// Effects scale with the dice value that landed the band on the space (栄冠式 ×出目).

import { buildPracticeScenes } from "./narrative";
import type { EventOutcome, GameState, Member, Param, PracticeResult, Space } from "./types";
import { PARAM_LABEL } from "./types";

const BOARD_LENGTH = 20; // spaces in one month; last is the live
const PRACTICE_GAIN = 2; // param points per member, per dice pip
const PRACTICE_STAMINA = 3; // stamina spent per member, per dice pip

const yen = (n: number) => `¥${n.toLocaleString()}`;

/** The four founding members (Vo/Gt/Ba/Dr). */
function initialMembers(): Member[] {
  return [
    { name: "RYO", part: "Vo", T: 48, P: 60, S: 52, V: 58, stamina: 100 },
    { name: "KEN", part: "Gt", T: 64, P: 50, S: 55, V: 46, stamina: 100 },
    { name: "MIO", part: "Ba", T: 58, P: 46, S: 50, V: 44, stamina: 100 },
    { name: "GO", part: "Dr", T: 62, P: 44, S: 42, V: 40, stamina: 100 },
  ];
}

/**
 * Themed board. Practice spaces are unified (no fixed param — the player picks
 * the training on landing). Non-fixed spaces stay hidden until landed on; the
 * final LIVE space is a fixed event that fires on pass-through.
 */
function buildBoard(rng: () => number): Space[] {
  const board: Space[] = [];
  for (let i = 0; i < BOARD_LENGTH - 1; i++) {
    const roll = rng();
    let space: Space;
    if (roll < 0.45) {
      space = { kind: "practice", label: "練習", fixed: false, revealed: false };
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

/**
 * Resolve a chosen practice with the dice multiplier. Each member gains
 * `PRACTICE_GAIN × mult` in the chosen param; stamina drops with effort.
 */
export function doPractice(state: GameState, param: Param, mult: number): PracticeResult {
  const gain = PRACTICE_GAIN * mult;
  const staminaCost = PRACTICE_STAMINA * mult;
  for (const m of state.members) {
    m[param] = Math.min(99, m[param] + gain);
    m.stamina = Math.max(0, m.stamina - staminaCost);
  }
  pushLog(state, `${PARAM_LABEL[param]}を練習（×${mult} → +${gain} / 全員）`);
  const outcome: EventOutcome = {
    icon: "🎸",
    title: `${PARAM_LABEL[param]}を特訓！`,
    deltas: [
      { label: PARAM_LABEL[param], value: `+${gain}`, dir: "up" },
      { label: "体力", value: `-${staminaCost}`, dir: "down" },
    ],
    reachedLive: false,
  };
  return { outcome, scenes: buildPracticeScenes(param, mult, gain) };
}

/**
 * Resolve a non-practice space with the dice multiplier `mult`. Quantitative
 * gains (money/fan/rest) scale with the roll; events are flat.
 */
export function resolveSpace(
  state: GameState,
  space: Space,
  mult: number,
  rng: () => number = Math.random,
): EventOutcome {
  switch (space.kind) {
    case "rest": {
      const rec = 8 * mult;
      for (const m of state.members) m.stamina = Math.min(100, m.stamina + rec);
      pushLog(state, `休息で体力回復（×${mult} → +${rec} / 全員）`);
      return { icon: "💤", title: `ゆっくり休息…（×${mult}）`, deltas: [{ label: "体力", value: `+${rec}`, dir: "up" }], reachedLive: false };
    }
    case "money": {
      const amt = (8_000 + Math.floor(rng() * 7_000)) * mult;
      state.funds += amt;
      pushLog(state, `バイトで${yen(amt)}稼いだ（×${mult}）`);
      return { icon: "💴", title: `バイトでひと稼ぎ（×${mult}）`, deltas: [{ label: "資金", value: `+${yen(amt)}`, dir: "up" }], reachedLive: false };
    }
    case "fan": {
      const f = (4 + Math.floor(rng() * 6)) * mult;
      state.segFans.core += f;
      state.totalFans += f;
      pushLog(state, `路上ライブでファン+${f}（×${mult}）`);
      return { icon: "🔥", title: `路上ライブ決行！（×${mult}）`, deltas: [{ label: "ファン", value: `+${f}`, dir: "up" }], reachedLive: false };
    }
    case "event":
      return resolveEvent(state, rng);
    case "live":
      pushLog(state, "月末ライブ当日！");
      return { icon: "🎤", title: "月末ライブ当日！", deltas: [], reachedLive: true };
    case "practice":
      // Practice is resolved via doPractice() after the player picks a training.
      return { icon: "🎸", title: "練習", deltas: [], reachedLive: false };
  }
}

/** Random band event (flat — independent of the dice). */
function resolveEvent(state: GameState, rng: () => number): EventOutcome {
  const r = rng();
  if (r < 0.4) {
    for (const m of state.members) m.stamina = Math.min(100, m.stamina + 12);
    pushLog(state, "ファンから差し入れ！（体力+12 / 全員）");
    return { icon: "🍱", title: "ファンから差し入れ！", deltas: [{ label: "体力", value: "+12", dir: "up" }], reachedLive: false };
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
