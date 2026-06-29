// Game loop orchestration. A turn is an animated sequence:
// roll dice -> hop the pin -> reveal the landed space -> float stat deltas,
// then re-render. Fixed events (LIVE) fire on pass-through.

import { applyLiveResult, resolveLive } from "./game/coreLoop";
import { computeTarget, newGame, pushLog, resolveSpace, rollDice, startNewMonth } from "./game/state";
import type { GameState } from "./game/types";
import { animateDice, animateOutcome, animatePin, animateReveal } from "./ui/anim";
import { render, type Handlers, type UiState } from "./ui/render";

const root = document.getElementById("app")!;

let state: GameState = newGame();
const ui: UiState = {
  mode: "board",
  panel: "none",
  rolling: false,
  lastRoll: 0,
  liveDecision: { cap: 600, target: "core", songIndex: 0 },
};

function redraw(): void {
  render(root, state, ui, handlers);
}

async function playTurn(): Promise<void> {
  if (ui.mode !== "board" || ui.rolling) return;
  ui.rolling = true;
  redraw();

  // 1. roll
  const roll = rollDice();
  ui.lastRoll = roll;
  const diceEl = root.querySelector<HTMLElement>(".dice");
  if (diceEl) await animateDice(diceEl, roll);

  // 2. move (fixed events stop the band on pass-through)
  const from = state.pos;
  const target = computeTarget(state, roll);
  await animatePin(root, from, target);
  state.pos = target;

  // 3. reveal + resolve the landed space
  const space = state.board[target];
  space.revealed = true;
  await animateReveal(root, target, space);
  const outcome = resolveSpace(state, space);

  // 4. surface stat changes
  await animateOutcome(root, target, outcome);

  ui.rolling = false;
  if (outcome.reachedLive) ui.mode = "live";
  redraw();
}

const handlers: Handlers = {
  onRoll() {
    void playTurn();
  },
  onOpenPanel(panel) {
    if (ui.rolling) return;
    ui.panel = panel;
    redraw();
  },
  onClosePanel() {
    ui.panel = "none";
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
    pushLog(state, `ライブ実施：動員${result.draw} / 満足度${result.satisfaction} / 新規ファン+${result.newFans}`);
    redraw();
  },
  onNextMonth() {
    startNewMonth(state);
    ui.mode = "board";
    ui.lastRoll = 0;
    ui.liveResult = undefined;
    redraw();
  },
};

redraw();
