// Game loop orchestration. Progression is a monthly loop of action-card turns
// (docs/phase1-cards.md): pick a card -> optional sub-choice -> VN slides ->
// advance the turn. After the month's turns, a live decision -> result.

import { applyLiveResult, resolveLive } from "./game/coreLoop";
import { buildLiveScenes } from "./game/narrative";
import {
  advanceTurn,
  newGame,
  pushLog,
  resolveAction,
  startNewMonth,
} from "./game/state";
import type { ActionKind, GameState, Param } from "./game/types";
import * as bgm from "./ui/audio";
import { render, type Handlers, type UiState } from "./ui/render";

const root = document.getElementById("app")!;

// BGM changes with the game context / progression (docs roadmap B1). Transient
// modes (slides, sub-choices) keep whatever track is playing.
function applyBgm(): void {
  let k: bgm.TrackKey | null = null;
  if (ui.mode === "title" || ui.mode === "partSelect") k = "metalroad";
  else if (ui.mode === "live") k = "crimson";
  else if (ui.mode === "result") k = "freedom";
  else if (ui.mode === "board") k = state.month >= 6 ? "metropolis" : state.month >= 3 ? "cosmos" : "rolling";
  if (k) bgm.play(k);
}

let state: GameState = newGame();
const ui: UiState = {
  mode: "title",
  panel: "none",
  sceneSeq: [],
  sceneIndex: 0,
  liveDecision: { cap: 150, target: "core", songIndex: 0 },
  auto: false,
};

// What to do once the current slideshow finishes.
let afterSlides: "turn" | "result" = "turn";

function redraw(): void {
  render(root, state, ui, handlers);
  applyBgm();
}

function playAction(kind: ActionKind, subId: string | undefined, param: Param | undefined): void {
  const { scenes } = resolveAction(state, kind, subId, param);
  afterSlides = "turn";
  ui.pendingCard = undefined;
  ui.sceneSeq = scenes;
  ui.sceneIndex = 0;
  ui.mode = "slides";
  redraw();
}

function finishSlides(): void {
  if (afterSlides === "result") {
    ui.mode = "result";
    redraw();
    return;
  }
  const next = advanceTurn(state); // "live" when the month's turns are done
  ui.mode = next === "live" ? "live" : "board";
  redraw();
}

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// Test-play auto mode. Advances the non-choice steps (VN slides, month-end
// result) hands-free; pauses on every player choice (card, sub, live).
let autoRunning = false;
async function autoLoop(): Promise<void> {
  if (autoRunning) return;
  autoRunning = true;
  try {
    while (ui.auto) {
      if (ui.mode === "slides") {
        handlers.onSlideNext();
        await wait(650);
      } else if (ui.mode === "result") {
        await wait(800);
        handlers.onNextMonth();
      } else {
        await wait(300);
      }
    }
  } finally {
    autoRunning = false;
  }
}

const handlers: Handlers = {
  onStart() {
    ui.mode = "partSelect";
    redraw();
  },
  onChoosePart(part, name) {
    state = newGame(part, name);
    ui.mode = "board";
    redraw();
  },
  onPlayCard(kind) {
    const card = state.hand.find((c) => c.kind === kind);
    if (card?.subs && card.subs.length > 0) {
      ui.pendingCard = kind;
      ui.mode = "cardSub";
      redraw();
    } else {
      playAction(kind, undefined, undefined);
    }
  },
  onChooseSub(subId) {
    const kind = ui.pendingCard;
    if (!kind) return;
    if (kind === "music" && subId === "practice") {
      ui.mode = "practiceChoice"; // keep pendingCard; wait for the param pick
      redraw();
    } else {
      playAction(kind, subId, undefined);
    }
  },
  onChooseTraining(param: Param) {
    playAction("music", "practice", param);
  },
  onSlideNext() {
    if (ui.sceneIndex < ui.sceneSeq.length - 1) {
      ui.sceneIndex += 1;
      redraw();
      return;
    }
    finishSlides();
  },
  onOpenPanel(panel) {
    ui.panel = panel;
    redraw();
  },
  onClosePanel() {
    ui.panel = "none";
    ui.pendingCard = undefined;
    if (ui.mode === "cardSub" || ui.mode === "practiceChoice") ui.mode = "board";
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
    pushLog(state, `ライブ実施：動員${result.draw} / 満足度${result.satisfaction} / 新規ファン+${result.newFans}`);
    afterSlides = "result";
    ui.sceneSeq = buildLiveScenes(state, ui.liveDecision, result);
    ui.sceneIndex = 0;
    ui.mode = "slides";
    redraw();
  },
  onNextMonth() {
    startNewMonth(state);
    ui.mode = "board";
    ui.liveResult = undefined;
    redraw();
  },
  onToggleAuto() {
    ui.auto = !ui.auto;
    redraw();
    if (ui.auto) void autoLoop();
  },
};

// Persistent BGM mute toggle (lives outside #app so re-renders don't drop it).
const bgmBtn = document.createElement("button");
bgmBtn.className = "bgm-btn";
bgmBtn.setAttribute("aria-label", "BGMのオン/オフ");
bgmBtn.textContent = bgm.isMuted() ? "🔇" : "🔊";
bgmBtn.addEventListener("click", () => {
  bgmBtn.textContent = bgm.toggleMute() ? "🔇" : "🔊";
});
document.body.appendChild(bgmBtn);

// Unlock audio on the first user gesture (autoplay is blocked until then).
const unlock = (): void => {
  bgm.resume();
  window.removeEventListener("pointerdown", unlock);
};
window.addEventListener("pointerdown", unlock);

redraw();
