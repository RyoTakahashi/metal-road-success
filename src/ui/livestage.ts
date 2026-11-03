// Live-stage mini-game — the on-screen, real-time player. Pure simulation lives
// in src/game/livestage.ts. The band (existing standing art) plays up top, the
// audience crowd (silhouette + penlights, 3 heat states crossfaded) cheers below.
// The player watches and reacts in real time: HYPE the crowd when it's receptive
// (big button / tap the crowd / Space), and lock in with a bandmate the instant
// their rhythm wobbles (tap that member / press F). Crowd heat drives the score,
// which converts to the live's satisfaction bonus. PC + mobile. Overlay on body.

import { L } from "../game/i18n";
import { charSrc, crowdSrc, setEvolution, type Mood } from "./assets";
import { evolutionInfix } from "../game/evolution";
import type { GameState, LiveDecision } from "../game/types";
import { segLabel } from "../game/types";
import {
  StageSim,
  LS,
  heatLevel,
  applyStageResult,
  stageGrade,
  type StageResult,
} from "../game/livestage";

const ORDER = ["RYO", "KEN", "MIO", "GO"]; // Vo / Gt / Ba / Dr across the stage

export function runLiveStage(
  state: GameState,
  decision: LiveDecision,
  onDone: (res: StageResult) => void,
): void {
  setEvolution(evolutionInfix(state.evoUnlocked));
  const keys = ORDER.filter((k) => state.members.some((m) => m.artKey === k));
  const nameOf = (k: string): string => state.members.find((m) => m.artKey === k)?.name ?? k;

  const overlay = document.createElement("div");
  overlay.className = "ls-overlay";
  overlay.innerHTML = `
    <div class="ls-stage">
      <div class="ls-band">${keys.map((k) => `
        <div class="ls-member" data-key="${k}">
          <div class="ls-warn">⚠ ${L("乱れてる！", "Off-beat!")}</div>
          <img class="ls-sprite" alt="${nameOf(k)}" src="${charSrc(k, "normal")}">
          <div class="ls-mname">${nameOf(k)}</div>
        </div>`).join("")}
      </div>
      <img class="ls-crowd ls-crowd-mid" src="${crowdSrc("mid")}" alt="">
      <img class="ls-crowd ls-crowd-low" src="${crowdSrc("low")}" alt="">
      <img class="ls-crowd ls-crowd-high" src="${crowdSrc("high")}" alt="">
      <div class="ls-chance" hidden>⚡ ${L("受けてる！ 今だ、煽れ！", "They're into it! HYPE now!")}</div>
    </div>
    <div class="ls-hud">
      <div class="ls-heatwrap">
        <span class="ls-heatlabel">${L("客席ヒート", "Crowd Heat")}</span>
        <div class="ls-heatbar"><i></i></div>
      </div>
      <div class="ls-time"><i></i></div>
      <div class="ls-targetlabel">${L("客層", "Crowd")}: <b>${segLabel(decision.target)}</b></div>
    </div>
    <div class="ls-fx"></div>
    <button class="ls-hype">🔥<b>${L("煽る", "HYPE")}</b></button>
    <div class="ls-start">
      <h2>🎤 ${L("ライブ本番！", "Showtime!")}</h2>
      <p>${L("客席を見て、盛り上がってる時に <b>煽る</b>（下のボタン／客席タップ／Space）", "Watch the crowd — hit <b>HYPE</b> when they're into it (button / tap the crowd / Space)")}</p>
      <p>${L("メンバーのリズムが <b>乱れたら</b>、そのメンバーを<b>タップして合わせる</b>（またはF）", "When a bandmate goes <b>off-beat</b>, <b>tap them to lock in</b> (or press F)")}</p>
      <p class="ls-hint">${L("ヒートを高く保つほど満足度が上がる！", "Keep the heat high for a better show!")}</p>
      <button class="ls-go btn">▶ ${L("スタート", "Start")}</button>
    </div>`;
  document.body.appendChild(overlay);

  const q = <T extends Element>(s: string): T => overlay.querySelector<T>(s)!;
  const heatFill = q<HTMLElement>(".ls-heatbar > i");
  const timeFill = q<HTMLElement>(".ls-time > i");
  const chanceEl = q<HTMLElement>(".ls-chance");
  const fxEl = q<HTMLElement>(".ls-fx");
  const hypeBtn = q<HTMLButtonElement>(".ls-hype");
  const lowImg = q<HTMLElement>(".ls-crowd-low");
  const highImg = q<HTMLElement>(".ls-crowd-high");
  const startEl = q<HTMLElement>(".ls-start");
  const memberEls = new Map<string, HTMLElement>();
  const spriteEls = new Map<string, HTMLImageElement>();
  const moodNow = new Map<string, Mood>();
  keys.forEach((k) => {
    const el = overlay.querySelector<HTMLElement>(`.ls-member[data-key="${k}"]`)!;
    memberEls.set(k, el);
    spriteEls.set(k, el.querySelector<HTMLImageElement>(".ls-sprite")!);
    moodNow.set(k, "normal");
  });

  const sim = new StageSim(keys);
  let raf = 0, last = 0, running = false;

  function flash(txt: string, cls: string): void {
    fxEl.textContent = txt;
    fxEl.className = "ls-fx " + cls;
    fxEl.style.opacity = "1";
    setTimeout(() => { fxEl.style.opacity = "0"; }, 320);
  }
  function doHype(): void {
    if (!running) return;
    const r = sim.hype();
    if (r === "big") flash(L("大歓声！", "ROAR!"), "big");
    else if (r === "small") flash(L("まあまあ", "meh"), "small");
  }
  function doRecover(key: string): void {
    if (!running) return;
    if (sim.recover(key)) flash(L("立て直した！", "Locked in!"), "big");
  }

  // input
  hypeBtn.addEventListener("pointerdown", (e) => { e.preventDefault(); doHype(); });
  q<HTMLElement>(".ls-stage").addEventListener("pointerdown", (e) => {
    const m = (e.target as HTMLElement).closest<HTMLElement>(".ls-member");
    if (m) { doRecover(m.dataset.key!); return; }
    // tapping the lower (crowd) part of the stage also hypes
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (e.clientY - rect.top > rect.height * 0.5) doHype();
  });
  function onKey(e: KeyboardEvent): void {
    if (e.repeat) return;
    if (e.code === "Space" || e.key === "j" || e.key === "J") { doHype(); e.preventDefault(); }
    else if (e.key === "f" || e.key === "F") {
      const w = sim.currentWobbler(); if (w) doRecover(w); e.preventDefault();
    }
  }
  window.addEventListener("keydown", onKey);

  function render(v: ReturnType<StageSim["tick"]>): void {
    const h = v.heat;
    heatFill.style.width = h + "%";
    heatFill.style.background = h >= 70 ? "linear-gradient(90deg,#ff5577,#ffcf3a)" : h >= 38 ? "linear-gradient(90deg,#54c7ff,#ff5577)" : "#54c7ff";
    timeFill.style.width = (100 * v.timeLeftMs / LS.durationMs) + "%";
    lowImg.style.opacity = String(Math.max(0, Math.min(1, 1 - h / 42)));
    highImg.style.opacity = String(Math.max(0, Math.min(1, (h - 62) / 30)));
    chanceEl.hidden = !v.windowOpen;
    hypeBtn.classList.toggle("ready", v.windowOpen);
    const lvl = heatLevel(h);
    for (const m of v.members) {
      const el = memberEls.get(m.key)!;
      el.classList.toggle("wobbling", m.wobbling);
      const mood: Mood = m.wobbling ? "sad" : lvl === "high" ? "fired" : "normal";
      if (moodNow.get(m.key) !== mood) {
        moodNow.set(m.key, mood);
        spriteEls.get(m.key)!.src = charSrc(m.key, mood);
      }
    }
  }

  function loop(ts: number): void {
    if (!last) last = ts;
    const dt = ts - last; last = ts;
    const v = sim.tick(dt);
    render(v);
    if (sim.done) { finish(); return; }
    raf = requestAnimationFrame(loop);
  }
  function begin(): void { running = true; last = 0; raf = requestAnimationFrame(loop); }
  function finish(): void {
    running = false;
    cancelAnimationFrame(raf);
    window.removeEventListener("keydown", onKey);
    overlay.remove();
    onDone(sim.finish());
  }

  function countdownThenStart(): void {
    startEl.hidden = true;
    const cd = document.createElement("div");
    cd.className = "ls-count";
    overlay.appendChild(cd);
    let n = 3;
    const tick = (): void => {
      cd.textContent = n > 0 ? String(n) : "GO!";
      if (n < 0) { cd.remove(); begin(); return; }
      n -= 1; setTimeout(tick, 600);
    };
    tick();
  }
  q<HTMLButtonElement>(".ls-go").addEventListener("click", countdownThenStart);
}

// re-export so main.ts can log the grade
export { applyStageResult, stageGrade };
