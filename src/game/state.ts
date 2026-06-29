// Initial game state, board generation, and per-space / per-turn mechanics.

import type { GameState, Member, Space } from "./types";
import { PARAM_LABEL, PARAMS } from "./types";

const BOARD_LENGTH = 20; // spaces in one month; last is the live
const STAMINA_COST_PER_STEP = 6; // ~栄冠: 5–7 per day
const PRACTICE_EXP = 100; // exp granted per practice landing (pre-condition)
const EXP_PER_POINT = 200; // exp needed to raise a param by 1

/** The four founding members (Vo/Gt/Ba/Dr). */
function initialMembers(): Member[] {
  return [
    { name: "RYO", part: "Vo", T: 48, P: 60, S: 52, V: 58, stamina: 100, exp: 0 },
    { name: "KEN", part: "Gt", T: 64, P: 50, S: 55, V: 46, stamina: 100, exp: 0 },
    { name: "MIO", part: "Ba", T: 58, P: 46, S: 50, V: 44, stamina: 100, exp: 0 },
    { name: "GO", part: "Dr", T: 62, P: 44, S: 42, V: 40, stamina: 100, exp: 0 },
  ];
}

/** Deterministic-ish themed board. Last space is always the live. */
function buildBoard(rng: () => number): Space[] {
  const board: Space[] = [];
  const practiceCycle = [...PARAMS];
  for (let i = 0; i < BOARD_LENGTH - 1; i++) {
    const roll = rng();
    let space: Space;
    if (roll < 0.45) {
      const param = practiceCycle[i % practiceCycle.length];
      space = { kind: "practice", param, label: `${PARAM_LABEL[param]}練` };
    } else if (roll < 0.65) {
      space = { kind: "rest", label: "休息" };
    } else if (roll < 0.78) {
      space = { kind: "money", label: "バイト" };
    } else if (roll < 0.9) {
      space = { kind: "fan", label: "路上" };
    } else {
      space = { kind: "event", label: "事件" };
    }
    board.push(space);
  }
  board.push({ kind: "live", label: "LIVE" });
  return board;
}

/** Draw a fresh hand of 3 progress cards (1–3 steps each). */
export function drawHand(rng: () => number = Math.random): number[] {
  return [0, 0, 0].map(() => 1 + Math.floor(rng() * 3));
}

export function newGame(rng: () => number = Math.random): GameState {
  return {
    month: 1,
    members: initialMembers(),
    support: { mk: 0.2, sn: 0.15 },
    songs: [
      {
        name: "Iron Dawn",
        lean: { core: 0.55, light: 0.15, visual: 0.1, expert: 0.2 },
        Q: 60,
      },
    ],
    funds: 300_000,
    totalFans: 1200,
    segFans: { core: 600, light: 300, visual: 150, expert: 150 },
    fame: 18,
    board: buildBoard(rng),
    pos: -1, // not yet on the board (start before space 0)
    hand: drawHand(rng),
    log: ["バンド「Metal Road」、活動開始！"],
  };
}

/** Reset the board for a new month (keeps band/fans/funds). */
export function startNewMonth(state: GameState, rng: () => number = Math.random): void {
  state.month += 1;
  state.board = buildBoard(rng);
  state.pos = -1;
  state.hand = drawHand(rng);
  // gentle stamina recovery between months
  for (const m of state.members) m.stamina = Math.min(100, m.stamina + 30);
  pushLog(state, `--- ${state.month}ヶ月目 スタート ---`);
}

export function pushLog(state: GameState, msg: string): void {
  state.log.unshift(msg);
  if (state.log.length > 40) state.log.pop();
}

function grantExp(state: GameState, param: (typeof PARAMS)[number]): void {
  const cond = 0.82 + 0.18 * avg(state.members.map((m) => m.stamina)) / 100;
  const gain = Math.round(PRACTICE_EXP * cond);
  for (const m of state.members) {
    m.exp += gain;
    while (m.exp >= EXP_PER_POINT) {
      m.exp -= EXP_PER_POINT;
      m[param] = Math.min(99, m[param] + 1);
    }
    m.stamina = Math.max(0, m.stamina - STAMINA_COST_PER_STEP);
  }
  pushLog(state, `${PARAM_LABEL[param]}を練習（+${gain}exp / 全員）`);
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/**
 * Apply the effect of the space the band just landed on.
 * Returns true if this space is the month-end live (caller opens the live UI).
 */
export function resolveSpace(
  state: GameState,
  space: Space,
  rng: () => number = Math.random,
): boolean {
  switch (space.kind) {
    case "practice":
      grantExp(state, space.param!);
      return false;
    case "rest":
      for (const m of state.members) m.stamina = Math.min(100, m.stamina + 25);
      pushLog(state, "休息で体力回復（+25 / 全員）");
      return false;
    case "money": {
      const amt = 20_000 + Math.floor(rng() * 30_000);
      state.funds += amt;
      pushLog(state, `バイトで¥${amt.toLocaleString()}稼いだ`);
      return false;
    }
    case "fan": {
      const f = 10 + Math.floor(rng() * 20);
      state.segFans.core += f;
      state.totalFans += f;
      pushLog(state, `路上ライブでファン+${f}`);
      return false;
    }
    case "event":
      return resolveEvent(state, rng);
    case "live":
      pushLog(state, "月末ライブ当日！");
      return true;
  }
}

/** Random band event (kind for now). */
function resolveEvent(state: GameState, rng: () => number): boolean {
  const r = rng();
  if (r < 0.4) {
    for (const m of state.members) m.exp += 60;
    pushLog(state, "スタジオで白熱したセッション！（全員 +60exp）");
  } else if (r < 0.7) {
    const amt = 15_000;
    state.funds = Math.max(0, state.funds - amt);
    pushLog(state, `機材トラブル… 修理に¥${amt.toLocaleString()}`);
  } else {
    state.support.sn = Math.min(1, state.support.sn + 0.05);
    pushLog(state, "SNS投稿がプチバズ！（SNS効果アップ）");
  }
  return false;
}
