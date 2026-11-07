// Live-stage mini-game — on-screen player. Over a stage backdrop (the band on
// stage + the silhouette crowd), each beat shows a CHOICE (MC line / solo /
// song); picking one reveals a COMMAND whose tempo & length depend on the choice.
// The command plays as a 4-LANE, top-down rhythm input: the four members stand
// each above their own lane (L→R: Gt, Vo, Dr, Ba = keys D F J K), and each member
// "launches" notes that fall down their lane to the hit line at the pad. A beat's
// payoff = choice crowd-fit × input accuracy. Crowd is pure feedback. PC keys +
// mobile taps. Full-screen overlay on document.body.

import { L } from "../game/i18n";
import { charSrc, crowdSrc, gearSrc, setEvolution, type Mood } from "./assets";
import { evolutionInfix } from "../game/evolution";
import type { GameState, LiveDecision } from "../game/types";
import { segLabel } from "../game/types";
import {
  BEATS, optionTiers, buildCommand, HIT, finalize, beatScore, excitement, heatLevel,
  stageGrade, applyStageResult, locStr, INTENSITY,
  PART_ORDER, PART_LABEL, PART_KEY, PART_KEYCAP,
  type PartKey, type Command, type BeatOutcome, type StageResult,
} from "../game/livestage";

const PART_COLOR: Record<PartKey, string> = { RYO: "#ff5577", KEN: "#54c7ff", MIO: "#b98cff", GO: "#4fd08a" };

export function runLiveStage(
  state: GameState,
  decision: LiveDecision,
  onDone: (res: StageResult) => void,
): void {
  setEvolution(evolutionInfix(state.evoUnlocked));
  const keys = PART_ORDER.filter((k) => state.members.some((m) => m.artKey === k));
  const nameOf = (k: string): string => state.members.find((m) => m.artKey === k)?.name ?? k;

  const overlay = document.createElement("div");
  overlay.className = "ls-overlay";
  overlay.innerHTML = `
    <div class="ls-stage">
      <div class="ls-gear">
        <img class="ls-pa ls-pa-l" src="${gearSrc("pa")}" alt="">
        <img class="ls-pa ls-pa-r" src="${gearSrc("pa")}" alt="">
        <img class="ls-amp ls-amp-l" src="${gearSrc("amp")}" alt="">
        <img class="ls-amp ls-amp-r" src="${gearSrc("amp")}" alt="">
        <img class="ls-drumkit" src="${gearSrc("drumkit")}" alt="">
        <div class="ls-floor"></div>
      </div>
      <div class="ls-cols">${keys.map((k) => `
        <div class="ls-col" data-key="${k}" style="--pc:${PART_COLOR[k]}">
          <div class="ls-member"><img class="ls-sprite" alt="${nameOf(k)}" src="${charSrc(k, "normal")}"></div>
          <div class="ls-lane"><div class="ls-notes"></div><div class="ls-hitline"></div></div>
          <button class="ls-pad" data-key="${k}"><b>${locStr(PART_LABEL[k])}</b><span class="ls-padname">${nameOf(k)}</span><small>${PART_KEYCAP[k]}</small></button>
        </div>`).join("")}
      </div>
      <img class="ls-crowd ls-crowd-mid" src="${crowdSrc("mid")}" alt="">
      <img class="ls-crowd ls-crowd-low" src="${crowdSrc("low")}" alt="">
      <img class="ls-crowd ls-crowd-high" src="${crowdSrc("high")}" alt="">
    </div>
    <div class="ls-hud">
      <div class="ls-heatwrap"><span class="ls-heatlabel">${L("客席", "Crowd")}</span><div class="ls-heatbar"><i></i></div></div>
      <div class="ls-topline"><span class="ls-beatno"></span><span class="ls-targetlabel">${L("客層", "Crowd")}: <b>${segLabel(decision.target)}</b></span></div>
    </div>
    <div class="ls-cmdtag" hidden></div>
    <div class="ls-preview" hidden></div>
    <div class="ls-fx"></div>

    <div class="ls-choice" hidden>
      <div class="ls-prompt"></div>
      <div class="ls-options"></div>
    </div>

    <div class="ls-start">
      <h2>🎤 ${L("ライブ本番！", "Showtime!")}</h2>
      <p>${L("まず<b>選択肢</b>（煽り方／曲）を選ぶ。選ぶと<b>コマンド</b>が始まる。", "Pick a <b>choice</b> (how to hype / which song). It starts a <b>command</b>.")}</p>
      <p>${L("各メンバーの<b>レーンにノーツが落ちてくる</b>。下のボタン（<b>D F J K</b>／タップ）でタイミングよく！", "Notes <b>fall down each member's lane</b>. Hit the pad below (<b>D F J K</b> / tap) in time!")}</p>
      <p class="ls-hint">${L("左から ギター・ボーカル・ドラム・ベース。客層に合う選択×正確な入力で満足度UP。", "L→R: Gt · Vo · Dr · Ba. Match the crowd and nail the input for a better show.")}</p>
      <button class="ls-go btn">▶ ${L("スタート", "Start")}</button>
    </div>`;
  document.body.appendChild(overlay);

  const q = <T extends Element>(s: string): T => overlay.querySelector<T>(s)!;
  const heatFill = q<HTMLElement>(".ls-heatbar > i");
  const beatNoEl = q<HTMLElement>(".ls-beatno");
  const cmdTagEl = q<HTMLElement>(".ls-cmdtag");
  const previewEl = q<HTMLElement>(".ls-preview");
  const fxEl = q<HTMLElement>(".ls-fx");
  const lowImg = q<HTMLElement>(".ls-crowd-low");
  const highImg = q<HTMLElement>(".ls-crowd-high");
  const choiceEl = q<HTMLElement>(".ls-choice");
  const promptEl = q<HTMLElement>(".ls-prompt");
  const optionsEl = q<HTMLElement>(".ls-options");
  const startEl = q<HTMLElement>(".ls-start");

  const col = new Map<PartKey, { member: HTMLElement; sprite: HTMLImageElement; notes: HTMLElement; lane: HTMLElement }>();
  const moodNow = new Map<string, Mood>();
  keys.forEach((k) => {
    const c = overlay.querySelector<HTMLElement>(`.ls-col[data-key="${k}"]`)!;
    col.set(k, {
      member: c.querySelector<HTMLElement>(".ls-member")!,
      sprite: c.querySelector<HTMLImageElement>(".ls-sprite")!,
      notes: c.querySelector<HTMLElement>(".ls-notes")!,
      lane: c.querySelector<HTMLElement>(".ls-lane")!,
    });
    moodNow.set(k, "normal");
  });

  let heat = 45;
  const scores: number[] = [];
  const outcomes: BeatOutcome[] = [];
  let perfects = 0, hits = 0, steps = 0;

  function setMood(k: string, mood: Mood): void {
    if (moodNow.get(k) === mood) return;
    moodNow.set(k, mood);
    col.get(k as PartKey)!.sprite.src = charSrc(k, mood);
  }
  function renderCrowd(): void {
    heatFill.style.width = heat + "%";
    heatFill.style.background = heat >= 68 ? "linear-gradient(90deg,#ff5577,#ffcf3a)" : heat >= 40 ? "linear-gradient(90deg,#54c7ff,#ff5577)" : "#54c7ff";
    lowImg.style.opacity = String(Math.max(0, Math.min(1, 1 - heat / 42)));
    highImg.style.opacity = String(Math.max(0, Math.min(1, (heat - 62) / 30)));
    const lvl = heatLevel(heat);
    keys.forEach((k) => setMood(k, lvl === "high" ? "fired" : lvl === "low" ? "sad" : "normal"));
  }
  function flash(txt: string, cls: string): void {
    fxEl.textContent = txt; fxEl.className = "ls-fx " + cls; fxEl.style.opacity = "1";
    setTimeout(() => { fxEl.style.opacity = "0"; }, 300);
  }
  function launch(k: PartKey): void {
    const m = col.get(k)!.member;
    m.classList.remove("launch"); void m.offsetWidth; m.classList.add("launch");
  }
  function laneFlash(k: PartKey, cls: string): void {
    const lane = col.get(k)!.lane;
    lane.classList.remove("flash", "flash-good"); void lane.offsetWidth;
    lane.classList.add(cls);
  }
  const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

  // --- choice phase -------------------------------------------------------
  function askChoice(beatIdx: number): Promise<number> {
    const beat = BEATS[beatIdx];
    promptEl.textContent = locStr(beat.prompt);
    optionsEl.innerHTML = "";
    choiceEl.hidden = false;
    return new Promise((resolve) => {
      beat.options.forEach((opt, i) => {
        const b = document.createElement("button");
        b.className = "ls-option";
        b.innerHTML = `<span class="ls-optlabel">${locStr(opt.label)}</span><span class="ls-optmeta">${locStr(INTENSITY[opt.intensity].tag)} · ${"♪".repeat(INTENSITY[opt.intensity].beats)} · ${INTENSITY[opt.intensity].steps}${L("打", "")}</span>`;
        b.addEventListener("click", () => { choiceEl.hidden = true; resolve(i); }, { once: true });
        optionsEl.appendChild(b);
      });
    });
  }

  // --- command (4-lane, top-down) -----------------------------------------
  function runCommand(cmd: Command): Promise<number> {
    overlay.classList.add("cmd");
    cmdTagEl.hidden = false;
    cmdTagEl.textContent = L(`コマンド（${cmd.steps.length}打）— 落ちてくるノーツをタイミングよく！`, `Command (${cmd.steps.length} hits) — tap each note as it lands!`);
    keys.forEach((k) => { col.get(k)!.notes.innerHTML = ""; });
    // full command, in order, shown up-front (highlights the next one to press)
    previewEl.hidden = false;
    previewEl.innerHTML = "";
    const chips = cmd.steps.map((s) => {
      const c = document.createElement("div");
      c.className = "ls-chip"; c.style.setProperty("--pc", PART_COLOR[s.part]);
      c.textContent = PART_KEYCAP[s.part];
      previewEl.appendChild(c);
      return c;
    });
    const leadMs = Math.max(1350, cmd.stepMs * 2.6); // fall time (slow & readable)
    interface N { el: HTMLElement; idx: number; part: PartKey; hitT: number; spawnT: number; judged: boolean; shown: boolean; launched: boolean }
    const notes: N[] = cmd.steps.map((s, i) => {
      const el = document.createElement("div");
      el.className = "ls-note";
      el.style.background = PART_COLOR[s.part];
      el.textContent = PART_KEYCAP[s.part];
      el.style.visibility = "hidden";
      col.get(s.part)!.notes.appendChild(el);
      return { el, idx: i, part: s.part, hitT: s.t + leadMs, spawnT: s.t, judged: false, shown: false, launched: false };
    });
    let stepHits = 0, stepPerf = 0;
    const total = cmd.steps.length;
    let start = 0, raf = 0, done = false;

    function judge(part: PartKey): void {
      const now = performance.now() - start;
      let best: N | null = null, bestDt = Infinity;
      for (const n of notes) {
        if (n.judged || n.part !== part) continue;
        const dt = Math.abs(n.hitT - now);
        if (dt < bestDt) { bestDt = dt; best = n; }
      }
      if (!best || bestDt > HIT.goodMs) { flash(L("ミス", "Miss"), "small"); return; }
      best.judged = true; best.el.classList.add("got");
      chips[best.idx].classList.add("done");
      launch(part);
      hits++; stepHits++;
      if (bestDt <= HIT.perfectMs) { perfects++; stepPerf++; laneFlash(part, "flash"); flash("PERFECT", "big"); }
      else { laneFlash(part, "flash-good"); flash("GOOD", "big"); }
    }
    function onKey(e: KeyboardEvent): void {
      if (e.repeat) return;
      const p = PART_KEY[e.key];
      if (p) { judge(p); e.preventDefault(); }
    }
    const padHandler = (e: Event): void => {
      e.preventDefault();
      const b = e.currentTarget as HTMLElement;
      b.classList.remove("tap"); void b.offsetWidth; b.classList.add("tap");
      judge(b.dataset.key as PartKey);
    };
    const pads = Array.from(overlay.querySelectorAll<HTMLElement>(".ls-pad"));
    window.addEventListener("keydown", onKey);
    pads.forEach((p) => p.addEventListener("pointerdown", padHandler));

    return new Promise<number>((resolve) => {
      function frame(ts: number): void {
        if (!start) start = ts;
        const now = ts - start;
        let nextIdx = -1;
        for (const n of notes) if (!n.judged) { nextIdx = n.idx; break; }
        chips.forEach((c, i) => c.classList.toggle("now", i === nextIdx));
        for (const n of notes) {
          if (now < n.spawnT) continue;
          if (!n.launched) { n.launched = true; launch(n.part); } // member fires it
          if (!n.shown) { n.shown = true; n.el.style.visibility = "visible"; }
          const laneH = col.get(n.part)!.lane.clientHeight || 300;
          const hitY = laneH * 0.86;
          const dt = n.hitT - now; // >0 falling
          const y = (1 - dt / leadMs) * hitY;
          n.el.style.transform = `translateY(${y}px)`;
          n.el.classList.toggle("near", !n.judged && Math.abs(dt) <= HIT.goodMs);
          n.el.style.opacity = n.judged ? "0.2" : dt < -HIT.goodMs ? "0.15" : "1";
          if (!n.judged && dt < -HIT.goodMs) { n.judged = true; chips[n.idx].classList.add("miss"); }
        }
        if (now >= cmd.totalMs + leadMs && !done) {
          done = true;
          cancelAnimationFrame(raf);
          window.removeEventListener("keydown", onKey);
          pads.forEach((p) => p.removeEventListener("pointerdown", padHandler));
          overlay.classList.remove("cmd");
          cmdTagEl.hidden = true;
          previewEl.hidden = true;
          steps += total;
          resolve(total ? (stepPerf + (stepHits - stepPerf) * 0.5) / total : 0);
          return;
        }
        raf = requestAnimationFrame(frame);
      }
      raf = requestAnimationFrame(frame);
    });
  }

  // --- orchestration ------------------------------------------------------
  async function play(): Promise<void> {
    for (let bi = 0; bi < BEATS.length; bi++) {
      beatNoEl.textContent = `${bi + 1} / ${BEATS.length}`;
      renderCrowd();
      const tiers = optionTiers(BEATS[bi], decision.target);
      const pick = await askChoice(bi);
      const opt = BEATS[bi].options[pick];
      const cmd = buildCommand(opt, (bi * 2654435761 + pick * 40503 + Date.now()) >>> 0);
      await wait(260);
      const exec = await runCommand(cmd);
      const outcome: BeatOutcome = { tier: tiers[pick], exec, intensity: opt.intensity };
      outcomes.push(outcome);
      const sc = beatScore(outcome);
      scores.push(sc);
      heat = excitement(scores);
      renderCrowd();
      flash(sc >= 0.85 ? L("大歓声！", "ROAR!") : sc >= 0.5 ? L("盛り上がり！", "Nice!") : L("うーん…", "Hmm…"), sc >= 0.5 ? "big" : "small");
      await wait(720);
    }
    finish();
  }
  function finish(): void {
    overlay.remove();
    onDone(finalize(outcomes, perfects, hits, steps));
  }

  renderCrowd();
  q<HTMLButtonElement>(".ls-go").addEventListener("click", () => { startEl.hidden = true; void play(); });
}

export { applyStageResult, stageGrade };
