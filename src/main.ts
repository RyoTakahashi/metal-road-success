// Game loop orchestration. Progression is a monthly loop of action-card turns
// (docs/phase1-cards.md): pick a card -> optional sub-choice -> VN slides ->
// advance the turn. After the month's turns, a live decision -> result.

import { applyLiveResult, resolveLive } from "./game/coreLoop";
import { applyLiveToMarket } from "./game/market";
import { buildLiveScenes } from "./game/narrative";
import {
  advanceTurn,
  buildAfterPartyScenes,
  buildIntroSequence,
  buildLivePreScenes,
  buildTieupOfferScenes,
  checkProgress,
  isCardLocked,
  maybeFindItem,
  newGame,
  nextTurnEvent,
  pushLog,
  registerLiveEvolution,
  resolveAction,
  resolveRecruit,
  startNewMonth,
  useItem,
} from "./game/state";
import type { ActionKind, GameState, Param, StaffRole } from "./game/types";
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
let afterSlides: "turn" | "result" | "board" | "clear" | "liveResolve" | "month" = "turn";

function redraw(): void {
  render(root, state, ui, handlers);
  applyBgm();
}

function playAction(kind: ActionKind, subId: string | undefined, param: Param | undefined): void {
  const { scenes } = resolveAction(state, kind, subId, param);
  const found = maybeFindItem(state); // 30% item drop after an action
  if (found) scenes.push(...found);
  afterSlides = "turn";
  ui.pendingCard = undefined;
  ui.sceneSeq = scenes;
  ui.sceneIndex = 0;
  ui.mode = "slides";
  redraw();
}

function finishSlides(): void {
  if (afterSlides === "liveResolve") {
    // Pre-show MC/performance choices are locked in; now resolve the live.
    const result = resolveLive(state, ui.liveDecision);
    applyLiveResult(state, ui.liveDecision, result);
    ui.liveResult = result;
    pushLog(state, `ライブ実施：動員${result.draw} / 満足度${result.satisfaction} / 新規ファン+${result.newFans}`);
    // An S rating (satisfaction ≥ 80) evolves the band's look to that layer's style.
    const evo = registerLiveEvolution(state, ui.liveDecision.target, result.satisfaction);
    // A strong targeted show pushes that segment's rival band back.
    applyLiveToMarket(state, ui.liveDecision.target, result.satisfaction);
    afterSlides = "result";
    ui.sceneSeq = [...buildLiveScenes(state, ui.liveDecision, result), ...evo];
    ui.sceneIndex = 0;
    ui.mode = "slides";
    redraw();
    return;
  }
  if (afterSlides === "month") {
    proceedMonth();
    return;
  }
  if (afterSlides === "result") {
    ui.mode = "result";
    redraw();
    return;
  }
  if (afterSlides === "board") {
    // e.g. milestone scenes at a month boundary — don't consume a turn
    ui.mode = "board";
    redraw();
    return;
  }
  if (afterSlides === "clear") {
    ui.mode = "clear";
    redraw();
    return;
  }
  const next = advanceTurn(state); // "live" when the month's turns are done
  if (next === "board") {
    // A friendship milestone, or occasionally a bandmate pulling you aside.
    const ev = nextTurnEvent(state);
    if (ev) {
      afterSlides = "board";
      ui.sceneSeq = ev;
      ui.sceneIndex = 0;
      ui.mode = "slides";
      redraw();
      return;
    }
  }
  ui.mode = next === "live" ? "live" : "board";
  redraw();
}

// Advance to the next month: recover/decay, then check the milestone ladder.
function proceedMonth(): void {
  startNewMonth(state);
  ui.liveResult = undefined;
  const prog = checkProgress(state); // milestone advance / clear / game over
  if (prog.kind === "gameover") {
    ui.mode = "gameover";
  } else if (prog.kind === "advance" || prog.kind === "clear") {
    afterSlides = prog.kind === "clear" ? "clear" : "board";
    ui.sceneSeq = prog.scenes;
    ui.sceneIndex = 0;
    ui.mode = "slides";
  } else {
    // Normal month: surface a tie-up offer (choice event) if one appeared.
    const offer = buildTieupOfferScenes(state);
    if (offer.length) {
      afterSlides = "board";
      ui.sceneSeq = offer;
      ui.sceneIndex = 0;
      ui.mode = "slides";
    } else {
      ui.mode = "board";
    }
  }
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
        const sc = ui.sceneSeq[ui.sceneIndex];
        if (sc?.choices?.length) handlers.onChooseReply(0);
        else handlers.onSlideNext();
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
    // opening monologue -> tutorial -> first checkpoint intro, then the board
    afterSlides = "board";
    ui.sceneSeq = buildIntroSequence(state);
    ui.sceneIndex = 0;
    ui.mode = "slides";
    redraw();
  },
  onPlayCard(kind) {
    if (isCardLocked(state, kind)) return; // exhausted: only 休息 is allowed
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
    } else if (kind === "network" && subId === "recruit") {
      ui.mode = "staffPick"; // keep pendingCard; wait for the role pick
      redraw();
    } else {
      playAction(kind, subId, undefined);
    }
  },
  onRecruit(role: StaffRole) {
    const { scenes } = resolveRecruit(state, role);
    const found = maybeFindItem(state);
    if (found) scenes.push(...found);
    afterSlides = "turn"; // recruiting spends the network turn
    ui.pendingCard = undefined;
    ui.sceneSeq = scenes;
    ui.sceneIndex = 0;
    ui.mode = "slides";
    redraw();
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
  onChooseReply(index) {
    const sc = ui.sceneSeq[ui.sceneIndex];
    const choice = sc?.choices?.[index];
    if (!choice) return;
    choice.apply?.(state);
    // Splice the picked reaction scenes in right after the prompt, then advance.
    if (choice.next?.length) ui.sceneSeq.splice(ui.sceneIndex + 1, 0, ...choice.next);
    if (ui.sceneIndex < ui.sceneSeq.length - 1) {
      ui.sceneIndex += 1;
      redraw();
    } else {
      finishSlides();
    }
  },
  onOpenPanel(panel) {
    ui.panel = panel;
    redraw();
  },
  onClosePanel() {
    ui.panel = "none";
    ui.pendingCard = undefined;
    if (ui.mode === "cardSub" || ui.mode === "practiceChoice" || ui.mode === "staffPick") ui.mode = "board";
    redraw();
  },
  onLiveChange(patch) {
    Object.assign(ui.liveDecision, patch);
    redraw();
  },
  onConfirmLive() {
    // The live is resolved only after the in-the-moment MC/performance choices.
    afterSlides = "liveResolve";
    ui.sceneSeq = buildLivePreScenes(state, ui.liveDecision);
    ui.sceneIndex = 0;
    ui.mode = "slides";
    redraw();
  },
  onNextMonth() {
    // Leaving the result screen: an after-party (choice event), then the month.
    if (ui.liveResult) {
      afterSlides = "month";
      ui.sceneSeq = buildAfterPartyScenes(state, ui.liveResult);
      ui.sceneIndex = 0;
      ui.mode = "slides";
      redraw();
    } else {
      proceedMonth();
    }
  },
  onRestart() {
    state = newGame();
    ui.mode = "title";
    ui.panel = "none";
    ui.pendingCard = undefined;
    ui.liveResult = undefined;
    ui.sceneSeq = [];
    ui.sceneIndex = 0;
    redraw();
  },
  onToggleAuto() {
    ui.auto = !ui.auto;
    redraw();
    if (ui.auto) void autoLoop();
  },
  onUseItem(id: string) {
    useItem(state, id);
    redraw(); // keep the panel open with updated counts / buffs
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
