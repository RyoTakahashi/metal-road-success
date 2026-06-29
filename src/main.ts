// Game loop orchestration. A turn is an animated sequence:
// roll dice -> hop the pin -> reveal the landed space. Then:
//  - practice space: player picks a training -> story slides -> stat floats
//  - live space: live decision -> story slides -> result
//  - other spaces: banner + floating stat deltas (scaled by the dice value)
// Effects scale with the dice value that landed the band (栄冠式 ×出目).

import { applyLiveResult, resolveLive } from "./game/coreLoop";
import { buildLiveSlides } from "./game/narrative";
import {
  computeTarget,
  doPractice,
  newGame,
  pushLog,
  resolveSpace,
  rollDice,
  startNewMonth,
} from "./game/state";
import type { EventOutcome, GameState, Param } from "./game/types";
import { animateDice, animateOutcome, animatePin, animateReveal } from "./ui/anim";
import { render, type Handlers, type UiState } from "./ui/render";

const root = document.getElementById("app")!;

let state: GameState = newGame();
const ui: UiState = {
  mode: "board",
  panel: "none",
  rolling: false,
  lastRoll: 0,
  pendingMult: 1,
  slideSeq: [],
  slideIndex: 0,
  liveDecision: { cap: 600, target: "core", songIndex: 0 },
};

// What to do once the current slideshow finishes.
let afterSlides: "board" | "result" = "board";
// Floats to pop on the board after practice slides close.
let floatAfter: { index: number; outcome: EventOutcome } | undefined;

function redraw(): void {
  render(root, state, ui, handlers);
}

async function playTurn(): Promise<void> {
  if (ui.mode !== "board" || ui.rolling) return;
  ui.rolling = true;
  redraw();

  // 1. roll — the value is also the effect multiplier
  const roll = rollDice();
  ui.lastRoll = roll;
  const diceEl = root.querySelector<HTMLElement>(".dice");
  if (diceEl) await animateDice(diceEl, roll);

  // 2. move (fixed events stop the band on pass-through)
  const from = state.pos;
  const target = computeTarget(state, roll);
  await animatePin(root, from, target);
  state.pos = target;

  // 3. reveal the landed space
  const space = state.board[target];
  space.revealed = true;
  await animateReveal(root, target, space);

  // 4. branch on space kind
  if (space.kind === "live") {
    ui.rolling = false;
    ui.mode = "live";
    redraw();
    return;
  }
  if (space.kind === "practice") {
    // wait for the player to choose a training; keep rolling=true until resolved
    ui.pendingMult = roll;
    ui.mode = "practiceChoice";
    redraw();
    return;
  }

  // other spaces resolve immediately, scaled by the dice value
  const outcome = resolveSpace(state, space, roll);
  await animateOutcome(root, target, outcome);
  ui.rolling = false;
  redraw();
}

async function finishSlides(): Promise<void> {
  if (afterSlides === "result") {
    ui.mode = "result";
    ui.rolling = false;
    redraw();
    return;
  }
  // practice path: back to board, then pop the stat floats
  ui.mode = "board";
  redraw();
  if (floatAfter) {
    await animateOutcome(root, floatAfter.index, floatAfter.outcome);
    floatAfter = undefined;
  }
  ui.rolling = false;
  redraw();
}

const handlers: Handlers = {
  onRoll() {
    void playTurn();
  },
  onOpenPanel(panel) {
    if (ui.rolling && ui.mode !== "board") return;
    ui.panel = panel;
    redraw();
  },
  onClosePanel() {
    ui.panel = "none";
    redraw();
  },
  onChooseTraining(param: Param) {
    const { outcome, slides } = doPractice(state, param, ui.pendingMult);
    floatAfter = { index: state.pos, outcome };
    afterSlides = "board";
    ui.slideSeq = slides;
    ui.slideIndex = 0;
    ui.mode = "slides";
    redraw();
  },
  onSlideNext() {
    if (ui.slideIndex < ui.slideSeq.length - 1) {
      ui.slideIndex += 1;
      redraw();
      return;
    }
    void finishSlides();
  },
  onLiveChange(patch) {
    Object.assign(ui.liveDecision, patch);
    redraw();
  },
  onConfirmLive() {
    const result = resolveLive(state, ui.liveDecision);
    applyLiveResult(state, ui.liveDecision, result);
    ui.liveResult = result;
    pushLog(state, `ライブ実施：動員${result.draw} / 満足度${result.satisfaction} / 新規ファン+${result.newFans}`);
    afterSlides = "result";
    ui.slideSeq = buildLiveSlides(state, ui.liveDecision, result);
    ui.slideIndex = 0;
    ui.mode = "slides";
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
