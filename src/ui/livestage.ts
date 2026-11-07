// Live-stage mini-game — on-screen player. Flow: over a stage backdrop (the band
// + the silhouette crowd), each beat shows a CHOICE (like the old MC/song
// prompts); picking one reveals a COMMAND — a sequence of the four part-buttons
// (Vo/Gt/Ba/Dr) whose tempo & length depend on the choice — which the player
// inputs in time. A beat's payoff = choice crowd-fit × input accuracy. The crowd
// is pure feedback (brighter/livelier with a better run). PC keys D/F/J/K +
// mobile taps. Mounts a full-screen overlay on document.body.

import { L } from "../game/i18n";
import { charSrc, crowdSrc, setEvolution, type Mood } from "./assets";
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

// Stage placement (audience's view): Bass 下手(left), Vocal center-front,
// Drums center-back (smaller/raised, behind), Guitar 上手(right).
const LAYOUT: Record<PartKey, { left: number; bottom: number; sc: number; z: number }> = {
  MIO: { left: 19, bottom: 2, sc: 1, z: 2 }, // Ba — 下手
  RYO: { left: 50, bottom: 0, sc: 1.08, z: 3 }, // Vo — 中央前
  GO: { left: 41, bottom: 24, sc: 0.72, z: 1 }, // Dr — 中央奥
  KEN: { left: 81, bottom: 2, sc: 1, z: 2 }, // Gt — 上手
};

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
      <div class="ls-band">${keys.map((k) => {
        const p = LAYOUT[k];
        return `<div class="ls-member" data-key="${k}" style="left:${p.left}%;bottom:${p.bottom}%;height:calc(46% * ${p.sc});z-index:${p.z}">
          <img class="ls-sprite" alt="${nameOf(k)}" src="${charSrc(k, "normal")}">
        </div>`;
      }).join("")}
      </div>
      <img class="ls-crowd ls-crowd-mid" src="${crowdSrc("mid")}" alt="">
      <img class="ls-crowd ls-crowd-low" src="${crowdSrc("low")}" alt="">
      <img class="ls-crowd ls-crowd-high" src="${crowdSrc("high")}" alt="">
    </div>
    <div class="ls-hud">
      <div class="ls-heatwrap"><span class="ls-heatlabel">${L("客席", "Crowd")}</span><div class="ls-heatbar"><i></i></div></div>
      <div class="ls-topline"><span class="ls-beatno"></span><span class="ls-targetlabel">${L("客層", "Crowd")}: <b>${segLabel(decision.target)}</b></span></div>
    </div>
    <div class="ls-fx"></div>

    <div class="ls-choice" hidden>
      <div class="ls-prompt"></div>
      <div class="ls-options"></div>
    </div>

    <div class="ls-cmd" hidden>
      <div class="ls-cmdtag"></div>
      <div class="ls-preview"></div>
      <div class="ls-lane"><div class="ls-hitline"></div><div class="ls-notes"></div></div>
      <div class="ls-pads">${keys.map((k) => `
        <button class="ls-pad" data-key="${k}" style="--pc:${PART_COLOR[k]}">
          <b>${locStr(PART_LABEL[k])}</b><span class="ls-padname">${nameOf(k)}</span><small>${PART_KEYCAP[k]}</small>
        </button>`).join("")}
      </div>
    </div>

    <div class="ls-start">
      <h2>🎤 ${L("ライブ本番！", "Showtime!")}</h2>
      <p>${L("まず<b>選択肢</b>を選ぶ（煽り方や曲）。選ぶと<b>コマンド</b>が流れてくる。", "Pick a <b>choice</b> (how to hype / which song). It reveals a <b>command</b>.")}</p>
      <p>${L("ノーツがラインに来たら、その<b>パート（Vo/Gt/Ba/Dr）</b>のボタンをタイミングよく！", "As each note hits the line, tap its <b>part button (Vo/Gt/Ba/Dr)</b> in time!")}</p>
      <p class="ls-hint">${L("客層に合う選択×正確な入力で、satisfaction が上がる。", "Match the crowd and nail the input for a better show.")}</p>
      <button class="ls-go btn">▶ ${L("スタート", "Start")}</button>
    </div>`;
  document.body.appendChild(overlay);

  const q = <T extends Element>(s: string): T => overlay.querySelector<T>(s)!;
  const heatFill = q<HTMLElement>(".ls-heatbar > i");
  const beatNoEl = q<HTMLElement>(".ls-beatno");
  const fxEl = q<HTMLElement>(".ls-fx");
  const lowImg = q<HTMLElement>(".ls-crowd-low");
  const highImg = q<HTMLElement>(".ls-crowd-high");
  const choiceEl = q<HTMLElement>(".ls-choice");
  const promptEl = q<HTMLElement>(".ls-prompt");
  const optionsEl = q<HTMLElement>(".ls-options");
  const cmdEl = q<HTMLElement>(".ls-cmd");
  const cmdTagEl = q<HTMLElement>(".ls-cmdtag");
  const notesEl = q<HTMLElement>(".ls-notes");
  const startEl = q<HTMLElement>(".ls-start");
  const spriteOf = new Map<string, HTMLImageElement>();
  const moodNow = new Map<string, Mood>();
  keys.forEach((k) => {
    spriteOf.set(k, overlay.querySelector<HTMLImageElement>(`.ls-member[data-key="${k}"] .ls-sprite`)!);
    moodNow.set(k, "normal");
  });

  let heat = 45;
  const scores: number[] = [];
  const outcomes: BeatOutcome[] = [];
  let perfects = 0, hits = 0, steps = 0;

  function setMood(k: string, mood: Mood): void {
    if (moodNow.get(k) === mood) return;
    moodNow.set(k, mood);
    spriteOf.get(k)!.src = charSrc(k, mood);
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
  function pulse(k: string): void {
    const el = spriteOf.get(k); if (!el) return;
    el.classList.remove("ls-hit"); void el.offsetWidth; el.classList.add("ls-hit");
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

  // --- command (QTE) phase ------------------------------------------------
  const previewEl = q<HTMLElement>(".ls-preview");
  function runCommand(cmd: Command): Promise<number> {
    cmdEl.hidden = false;
    cmdTagEl.textContent = L(`コマンド（${cmd.steps.length}打）— 流れてくるボタンを順に！`, `Command (${cmd.steps.length} hits) — press each button as it arrives!`);
    notesEl.innerHTML = "";
    previewEl.innerHTML = "";
    // Full command shown up-front, in order (points to each button to press).
    const previewChips = cmd.steps.map((s) => {
      const c = document.createElement("div");
      c.className = "ls-chip";
      c.style.setProperty("--pc", PART_COLOR[s.part]);
      c.textContent = PART_KEYCAP[s.part];
      previewEl.appendChild(c);
      return c;
    });
    // Generous lead so the whole (slow) command is readable before the first hit.
    const leadMs = Math.max(1600, cmd.stepMs * 3);
    const noteEls = cmd.steps.map((s, i) => {
      const el = document.createElement("div");
      el.className = "ls-note";
      el.style.background = PART_COLOR[s.part];
      el.textContent = PART_KEYCAP[s.part]; // the BUTTON to press, not the part name
      notesEl.appendChild(el);
      return { el, idx: i, part: s.part, hitT: s.t + leadMs, judged: false };
    });
    let stepHits = 0, stepPerf = 0;
    const total = cmd.steps.length;
    let start = 0, raf = 0, done = false;

    function judge(part: PartKey): void {
      const now = performance.now() - start;
      let best: typeof noteEls[0] | null = null, bestDt = Infinity;
      for (const n of noteEls) {
        if (n.judged || n.part !== part) continue;
        const dt = Math.abs(n.hitT - now);
        if (dt < bestDt) { bestDt = dt; best = n; }
      }
      if (!best || bestDt > HIT.goodMs) { flash(L("ミス", "Miss"), "small"); return; }
      best.judged = true;
      best.el.classList.add("got");
      previewChips[best.idx].classList.add("done");
      pulse(part);
      hits++; stepHits++;
      if (bestDt <= HIT.perfectMs) { perfects++; stepPerf++; flash("PERFECT", "big"); }
      else { flash("GOOD", "big"); }
    }
    function onKey(e: KeyboardEvent): void {
      if (e.repeat) return;
      const p = PART_KEY[e.key];
      if (p) { judge(p); e.preventDefault(); }
    }
    const padHandler = (e: Event): void => {
      e.preventDefault();
      const b = (e.currentTarget as HTMLElement);
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
        const laneW = notesEl.clientWidth || overlay.clientWidth;
        const hitX = laneW * 0.14;
        // highlight the next note to press (earliest unjudged)
        let nextIdx = -1;
        for (const n of noteEls) if (!n.judged) { nextIdx = n.idx; break; }
        previewChips.forEach((c, i) => c.classList.toggle("now", i === nextIdx));
        for (const n of noteEls) {
          const dt = n.hitT - now; // >0 approaching
          const x = hitX + (dt / leadMs) * (laneW - hitX);
          n.el.style.transform = `translateX(${x}px)`;
          n.el.classList.toggle("near", !n.judged && Math.abs(dt) <= HIT.goodMs);
          n.el.style.opacity = n.judged ? "0.22" : dt < -HIT.goodMs ? "0.2" : "1";
          if (!n.judged && dt < -HIT.goodMs) { n.judged = true; previewChips[n.idx].classList.add("miss"); }
        }
        if (now >= cmd.totalMs + leadMs && !done) {
          done = true;
          cancelAnimationFrame(raf);
          window.removeEventListener("keydown", onKey);
          pads.forEach((p) => p.removeEventListener("pointerdown", padHandler));
          cmdEl.hidden = true;
          steps += total;
          const exec = total ? (stepPerf + (stepHits - stepPerf) * 0.5) / total : 0;
          resolve(exec);
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
      beatNoEl.textContent = L(`${bi + 1} / ${BEATS.length}`, `${bi + 1} / ${BEATS.length}`);
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
      await wait(700);
    }
    finish();
  }
  function finish(): void {
    overlay.remove();
    onDone(finalize(outcomes, perfects, hits, steps));
  }

  // tap a band member also works as that part's button during a command
  q<HTMLElement>(".ls-stage").addEventListener("pointerdown", (e) => {
    const m = (e.target as HTMLElement).closest<HTMLElement>(".ls-member");
    if (m && !cmdEl.hidden) overlay.querySelector<HTMLElement>(`.ls-pad[data-key="${m.dataset.key}"]`)?.dispatchEvent(new PointerEvent("pointerdown"));
  });

  renderCrowd();
  q<HTMLButtonElement>(".ls-go").addEventListener("click", () => { startEl.hidden = true; void play(); });
}

export { applyStageResult, stageGrade };
