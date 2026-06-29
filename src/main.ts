// Game loop orchestration: advance the band along the sugoroku board, resolve
// spaces, run the month-end live, then roll into the next month.

import { applyLiveResult, resolveLive } from "./game/coreLoop";
import {
  drawHand,
  newGame,
  pushLog,
  resolveSpace,
  startNewMonth,
} from "./game/state";
import type { GameState } from "./game/types";
import { render, type Handlers, type UiState } from "./ui/render";

const root = document.getElementById("app")!;

let state: GameState = newGame();
const ui: UiState = {
  mode: "board",
  liveDecision: { cap: 600, target: "core", songIndex: 0 },
};

function redraw(): void {
  render(root, state, ui, handlers);
}

const handlers: Handlers = {
  onPlayCard(index) {
    if (ui.mode !== "board") return;
    const steps = state.hand[index];
    if (steps == null) return;

    // advance, clamped to the live space (can't overshoot the month).
    const target = Math.min(state.pos + steps, state.board.length - 1);
    state.pos = target;
    const space = state.board[state.pos];
    pushLog(state, `「${steps}進む」を使用 → ${space.label}`);

    const reachedLive = resolveSpace(state, space);

    // refresh the hand; if empty after playing, deal a new set
    state.hand.splice(index, 1);
    if (state.hand.length === 0) state.hand = drawHand();

    if (reachedLive) {
      ui.mode = "live";
    }
    redraw();
  },

  onLiveChange(patch) {
    Object.assign(ui.liveDecision, patch);
    redraw();
  },

  onConfirmLive() {
    const result = resolveLive(state, ui.liveDecision);
    applyLiveResult(state, ui.liveDecision, result);
    ui.liveResult = result;
    ui.mode = "result";
    pushLog(
      state,
      `ライブ実施：動員${result.draw} / 満足度${result.satisfaction} / 新規ファン+${result.newFans}`,
    );
    redraw();
  },

  onNextMonth() {
    startNewMonth(state);
    ui.mode = "board";
    ui.liveResult = undefined;
    redraw();
  },
};

redraw();
