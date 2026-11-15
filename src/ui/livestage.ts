// Live-stage mini-game — on-screen player. The band plays on a lit stage over a
// penlight crowd. Each beat shows a CHOICE (MC line / solo / song); picking one
// starts a COMMAND: a sequence of "calls" where one member is spotlit and a ring
// collapses onto her — you tap THAT member (or her key D/F/J/K) as the ring lands.
// A beat's payoff = choice crowd-fit × timing accuracy. The set builds through
// named sections to a climax "キメ所" (全員ジャンプ). Crowd is live feedback.
// Full-screen overlay on document.body. PC keys + mobile taps.

import { L } from "../game/i18n";
import { charSrc, crowdSrc, gearSrc, setEvolution, type Mood } from "./assets";
import { evolutionInfix } from "../game/evolution";
import type { GameState, LiveDecision } from "../game/types";
import { segLabel } from "../game/types";
import {
  BEATS, optionTiers, buildCommand, HIT, finalize, beatScore, excitement, heatLevel,
  stageGrade, applyStageResult, locStr, INTENSITY, SECTIONS, KIME, applyKime,
  PART_ORDER, PART_KEY, PART_KEYCAP,
  type PartKey, type Command, type BeatOutcome, type StageResult,
} from "../game/livestage";

const PART_COLOR: Record<PartKey, string> = { RYO: "#ff5577", KEN: "#54c7ff", MIO: "#b98cff", GO: "#4fd08a" };
const PART_EN: Record<PartKey, string> = { RYO: "VOCAL", KEN: "GUITAR", MIO: "BASS", GO: "DRUMS" };

type Grade = "perfect" | "good" | "miss";

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
      <div class="ls-rig"><div class="ls-beam b1"></div><div class="ls-beam b2"></div><div class="ls-beam b3"></div><div class="ls-beam b4"></div></div>
      <div class="ls-floor"></div><div class="ls-riser"></div>
      <img class="ls-gear ls-amp-l" src="${gearSrc("bassamp")}" alt="">
      <img class="ls-gear ls-amp-r" src="${gearSrc("amp")}" alt="">
      <img class="ls-gear ls-pa-l" src="${gearSrc("pa")}" alt="">
      <img class="ls-gear ls-pa-r" src="${gearSrc("pa")}" alt="">
      <img class="ls-gear ls-drumkit" src="${gearSrc("drumkit")}" alt="">
      <div class="ls-haze"></div>

      <div class="ls-band">${keys.map((k) => `
        <div class="ls-mem" data-key="${k}" style="--c:${PART_COLOR[k]}">
          <div class="ls-taphint">▼ ${L("タップ！", "TAP")}</div>
          <div class="ls-ring"></div><div class="ls-cue">♪</div>
          <img class="ls-sprite" alt="${nameOf(k)}" src="${charSrc(k, "normal")}">
          <div class="ls-badge">${nameOf(k)}<small>${PART_EN[k]}</small><kbd>${PART_KEYCAP[k]}</kbd></div>
        </div>`).join("")}
      </div>

      <div class="ls-crowdwrap">
        <img class="ls-crowd ls-crowd-mid" src="${crowdSrc("mid")}" alt="">
        <img class="ls-crowd ls-crowd-low" src="${crowdSrc("low")}" alt="">
        <img class="ls-crowd ls-crowd-high" src="${crowdSrc("high")}" alt="">
      </div>
      <div class="ls-penlights"></div>
      <div class="ls-flash"></div>
    </div>

    <div class="ls-hud">
      <div class="ls-hype"><div class="ls-hlab">HYPE</div><div class="ls-segs"></div></div>
      <div class="ls-setlist"><div class="ls-slbig"></div><div class="ls-slsub">${L("客層", "Crowd")}: <b>${segLabel(decision.target)}</b></div></div>
    </div>
    <div class="ls-fx"></div>
    <div class="ls-banner"><div class="ls-bn-kick"></div><div class="ls-bn-title"></div></div>

    <div class="ls-choice" hidden>
      <div class="ls-prompt"></div>
      <div class="ls-options"></div>
    </div>

    <div class="ls-kime" hidden>
      <div class="ls-kime-sub"></div>
      <div class="ls-kime-big"></div>
      <div class="ls-kime-count"></div>
      <div class="ls-kime-tap">${L("画面をタップ！", "Tap the screen!")}</div>
    </div>

    <div class="ls-start">
      <h2>🎤 ${L("ライブ本番！", "Showtime!")}</h2>
      <p>${L("まず<b>選択肢</b>（煽り方／曲）を選ぶ。選ぶと、メンバーの一人に<b>スポットライトとリング</b>が出る。", "Pick a <b>choice</b> (how to hype / which song). One member gets a <b>spotlight & ring</b>.")}</p>
      <p>${L("リングが重なった瞬間に、<b>そのメンバーをタップ</b>！（PCは <b>D F J K</b>）", "The moment the ring snaps in, <b>tap that member</b>! (PC: <b>D F J K</b>)")}</p>
      <p class="ls-hint">${L("最後は「全員で跳べ！」のキメ所。客層に合う選択×正確なタイミングで満足度UP。", "End on the “everyone JUMP!” climax. Match the crowd & nail the timing for a better show.")}</p>
      <button class="ls-go btn">▶ ${L("スタート", "Start")}</button>
    </div>`;
  document.body.appendChild(overlay);

  const q = <T extends Element>(s: string): T => overlay.querySelector<T>(s)!;
  const stageEl = q<HTMLElement>(".ls-stage");
  const crowdWrap = q<HTMLElement>(".ls-crowdwrap");
  const lowImg = q<HTMLElement>(".ls-crowd-low");
  const highImg = q<HTMLElement>(".ls-crowd-high");
  const penBox = q<HTMLElement>(".ls-penlights");
  const flashEl = q<HTMLElement>(".ls-flash");
  const segsEl = q<HTMLElement>(".ls-segs");
  const slBig = q<HTMLElement>(".ls-slbig");
  const fxEl = q<HTMLElement>(".ls-fx");
  const bannerEl = q<HTMLElement>(".ls-banner");
  const bnKick = q<HTMLElement>(".ls-bn-kick");
  const bnTitle = q<HTMLElement>(".ls-bn-title");
  const choiceEl = q<HTMLElement>(".ls-choice");
  const promptEl = q<HTMLElement>(".ls-prompt");
  const optionsEl = q<HTMLElement>(".ls-options");
  const startEl = q<HTMLElement>(".ls-start");

  interface Col { mem: HTMLElement; sprite: HTMLImageElement; ring: HTMLElement; cue: HTMLElement }
  const col = new Map<PartKey, Col>();
  const moodNow = new Map<string, Mood>();
  keys.forEach((k) => {
    const c = overlay.querySelector<HTMLElement>(`.ls-mem[data-key="${k}"]`)!;
    col.set(k, {
      mem: c, sprite: c.querySelector<HTMLImageElement>(".ls-sprite")!,
      ring: c.querySelector<HTMLElement>(".ls-ring")!, cue: c.querySelector<HTMLElement>(".ls-cue")!,
    });
    moodNow.set(k, "normal");
  });

  // penlight field
  const PEN_HUES = ["#ff5577", "#54c7ff", "#b98cff", "#ffd36a", "#4fd08a", "#ffffff"];
  const penEls: HTMLElement[] = [];
  const PEN_N = 34;
  for (let i = 0; i < PEN_N; i++) {
    const p = document.createElement("span");
    p.className = "ls-pen";
    p.style.left = 2 + Math.random() * 96 + "%";
    p.style.height = 26 + Math.random() * 30 + "px";
    p.style.setProperty("--pc", PEN_HUES[i % PEN_HUES.length]);
    p.style.setProperty("--dur", (1.1 + Math.random() * 0.9).toFixed(2) + "s");
    p.style.setProperty("--delay", (-Math.random() * 1.4).toFixed(2) + "s");
    penBox.appendChild(p);
    penEls.push(p);
  }
  penBox.classList.add("sway");
  // hype meter segments
  const SEG_N = 14;
  const segEls: HTMLElement[] = [];
  for (let i = 0; i < SEG_N; i++) { const s = document.createElement("span"); s.className = "ls-seg"; segsEl.appendChild(s); segEls.push(s); }

  let heat = 45;
  const scores: number[] = [];
  const outcomes: BeatOutcome[] = [];
  let perfects = 0, hits = 0, steps = 0;

  const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
  function setMood(k: string, mood: Mood): void {
    if (moodNow.get(k) === mood) return;
    moodNow.set(k, mood);
    col.get(k as PartKey)!.sprite.src = charSrc(k, mood);
  }
  function renderCrowd(): void {
    lowImg.style.opacity = String(Math.max(0, Math.min(1, 1 - heat / 42)));
    highImg.style.opacity = String(Math.max(0, Math.min(1, (heat - 62) / 30)));
    const lvl = heatLevel(heat);
    keys.forEach((k) => setMood(k, lvl === "high" ? "fired" : lvl === "low" ? "sad" : "normal"));
    const base = (0.16 + (heat / 100) * 0.6).toFixed(2);
    penEls.forEach((p) => p.style.setProperty("--base", base));
    const on = Math.round((heat / 100) * SEG_N);
    segEls.forEach((s, i) => s.classList.toggle("on", i < on));
  }
  function flash(txt: string, cls: string): void {
    fxEl.textContent = txt; fxEl.className = "ls-fx " + cls; fxEl.style.opacity = "1";
    setTimeout(() => { fxEl.style.opacity = "0"; }, 320);
  }
  function launch(k: PartKey): void { const m = col.get(k)!.mem; m.classList.remove("launch"); void m.offsetWidth; m.classList.add("launch"); }
  function memFx(k: PartKey, g: Grade): void {
    const m = col.get(k)!.mem; const cls = "fx-" + g;
    m.classList.remove("fx-perfect", "fx-good", "fx-miss"); void m.offsetWidth; m.classList.add(cls);
  }
  function crowdPop(): void { crowdWrap.classList.remove("pop"); void crowdWrap.offsetWidth; crowdWrap.classList.add("pop"); }
  function crowdJump(): void { crowdWrap.classList.remove("jump"); void crowdWrap.offsetWidth; crowdWrap.classList.add("jump"); }
  function penSurge(): void { penBox.classList.remove("surge"); void penBox.offsetWidth; penBox.classList.add("surge"); }
  function shake(big = false): void { const cls = big ? "shake-b" : "shake-s"; stageEl.classList.remove("shake-s", "shake-b"); void stageEl.offsetWidth; stageEl.classList.add(cls); }
  function whiteFlash(): void { flashEl.classList.remove("go"); void flashEl.offsetWidth; flashEl.classList.add("go"); }
  function showBanner(i: number): Promise<void> {
    bnKick.textContent = `PART ${i + 1}`;
    bnTitle.textContent = locStr(SECTIONS[i] ?? SECTIONS[SECTIONS.length - 1]);
    slBig.textContent = `♪ ${i + 1} / ${BEATS.length}`;
    bannerEl.classList.remove("show"); void bannerEl.offsetWidth; bannerEl.classList.add("show");
    return wait(1250);
  }

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

  // --- command: sequential member "calls" ---------------------------------
  function runCommand(cmd: Command): Promise<number> {
    overlay.classList.add("cmd");
    const total = cmd.steps.length;
    const approach = Math.min(920, Math.max(540, cmd.stepMs * 1.2)); // ring collapse time; tempo-driven
    let idx = 0, stepPerf = 0, stepHits = 0;
    let active: { part: PartKey; landAt: number; done: boolean } | null = null;
    let raf = 0;
    let endCmd = (): void => {};

    function setRing(part: PartKey, scale: number, opacity: number, near: boolean): void {
      const c = col.get(part)!;
      c.ring.style.transform = `translate(-50%,-50%) scale(${scale})`;
      c.ring.style.opacity = String(opacity);
      c.ring.classList.toggle("near", near);
      c.cue.style.opacity = String(opacity);
    }
    function hideRing(part: PartKey): void { const c = col.get(part)!; c.ring.style.opacity = "0"; c.cue.style.opacity = "0"; c.ring.classList.remove("near"); }

    function resolve1(g: Grade): void {
      if (!active || active.done) return;
      active.done = true;
      const part = active.part;
      cancelAnimationFrame(raf);
      hideRing(part);
      col.get(part)!.mem.classList.remove("call");
      if (g === "perfect") { stepPerf++; stepHits++; perfects++; hits++; memFx(part, "perfect"); launch(part); flash("PERFECT", "big"); crowdPop(); penSurge(); }
      else if (g === "good") { stepHits++; hits++; memFx(part, "good"); launch(part); flash("GOOD", "big"); penSurge(); }
      else { memFx(part, "miss"); flash(L("ミス", "Miss"), "small"); }
      idx++;
      setTimeout(startCall, 180);
    }

    function startCall(): void {
      if (idx >= total) { endCmd(); return; }
      let part = cmd.steps[idx].part;
      if (!col.has(part)) part = keys[0];
      const c = col.get(part)!;
      c.mem.classList.add("call");
      const t0 = performance.now();
      active = { part, landAt: t0 + approach, done: false };
      function fr(): void {
        if (!active || active.done) return;
        const now = performance.now();
        const p = Math.min(1, (now - t0) / approach); // 0→1 at landing
        const near = now >= active.landAt - HIT.goodMs;
        setRing(part, 2.6 - 1.6 * p, Math.min(1, p * 1.5), near);
        if (now >= active.landAt + HIT.goodMs) { resolve1("miss"); return; }
        raf = requestAnimationFrame(fr);
      }
      raf = requestAnimationFrame(fr);
    }

    function onInput(part: PartKey): void {
      if (!active || active.done) return;
      if (part !== active.part) { memFx(part, "miss"); return; } // wrong member — gentle, no penalty
      const dt = performance.now() - active.landAt;
      resolve1(Math.abs(dt) <= HIT.perfectMs ? "perfect" : Math.abs(dt) <= HIT.goodMs ? "good" : "miss");
    }
    function onKey(e: KeyboardEvent): void { if (e.repeat) return; const p = PART_KEY[e.key]; if (p) { e.preventDefault(); onInput(p); } }
    const memHandlers: Array<[HTMLElement, (e: Event) => void]> = [];
    keys.forEach((k) => {
      const h = (e: Event): void => { e.preventDefault(); onInput(k); };
      col.get(k)!.mem.addEventListener("pointerdown", h);
      memHandlers.push([col.get(k)!.mem, h]);
    });
    window.addEventListener("keydown", onKey);

    return new Promise<number>((resolveP) => {
      endCmd = (): void => {
        overlay.classList.remove("cmd");
        window.removeEventListener("keydown", onKey);
        memHandlers.forEach(([el, h]) => el.removeEventListener("pointerdown", h));
        steps += total;
        resolveP(total ? (stepPerf + (stepHits - stepPerf) * 0.5) / total : 0);
      };
      startCall();
    });
  }

  // --- climax キメ所: countdown → everyone JUMP -----------------------------
  function runKime(): Promise<boolean> {
    const kimeEl = q<HTMLElement>(".ls-kime");
    const subEl = q<HTMLElement>(".ls-kime-sub");
    const bigEl = q<HTMLElement>(".ls-kime-big");
    const countEl = q<HTMLElement>(".ls-kime-count");
    subEl.textContent = locStr(SECTIONS[SECTIONS.length - 1]);
    bigEl.textContent = locStr(KIME.cue);
    kimeEl.hidden = false;
    return new Promise<boolean>((resolve) => {
      let done = false, dropAt = 0, ci = 0;
      const counts = ["3", "2", "1"];
      countEl.classList.remove("go");
      countEl.textContent = counts[0];
      const iv = setInterval(() => {
        ci++;
        if (ci < counts.length) { countEl.textContent = counts[ci]; }
        else { clearInterval(iv); drop(); }
      }, 660);
      function drop(): void {
        countEl.textContent = L("跳べッ!!", "JUMP!!");
        countEl.classList.add("go");
        dropAt = performance.now();
        setTimeout(() => { if (!done) settle(false); }, KIME.window + 240);
      }
      function settle(hit: boolean): void {
        if (done) return; done = true;
        clearInterval(iv);
        window.removeEventListener("keydown", onKey);
        kimeEl.removeEventListener("pointerdown", onTap);
        if (hit) {
          keys.forEach((k) => { setMood(k, "fired"); launch(k); });
          heat = 100; renderCrowd();
          crowdJump(); penSurge(); shake(true); whiteFlash();
          flash(locStr(KIME.hit), "big");
        } else { flash(locStr(KIME.miss), "small"); shake(false); }
        setTimeout(() => { kimeEl.hidden = true; resolve(hit); }, hit ? 1150 : 700);
      }
      function tryHit(): void {
        if (done) return;
        if (!dropAt) { shake(false); return; } // tapped before the drop — just a rumble
        settle(Math.abs(performance.now() - dropAt) <= KIME.window);
      }
      const onKey = (e: KeyboardEvent): void => { if (e.repeat) return; if (e.key === " " || PART_KEY[e.key]) { e.preventDefault(); tryHit(); } };
      const onTap = (e: Event): void => { e.preventDefault(); tryHit(); };
      window.addEventListener("keydown", onKey);
      kimeEl.addEventListener("pointerdown", onTap);
    });
  }

  // After a beat, the crowd answers in proportion to how it went.
  async function crowdAnswer(sc: number): Promise<void> {
    renderCrowd();
    penSurge();
    if (sc >= 0.85) { flash(L("大・歓・声！！", "HUGE ROAR!!"), "big"); crowdPop(); shake(true); whiteFlash(); }
    else if (sc >= 0.5) { flash(L("盛り上がり！", "Nice!"), "big"); crowdPop(); shake(false); }
    else flash(L("うーん…", "Hmm…"), "small");
    await wait(820);
  }

  // --- orchestration ------------------------------------------------------
  async function play(): Promise<void> {
    for (let bi = 0; bi < BEATS.length; bi++) {
      renderCrowd();
      await showBanner(bi);
      const tiers = optionTiers(BEATS[bi], decision.target);
      const pick = await askChoice(bi);
      const opt = BEATS[bi].options[pick];
      const cmd = buildCommand(opt, (bi * 2654435761 + pick * 40503 + Date.now()) >>> 0);
      await wait(220);
      const exec = await runCommand(cmd);
      const outcome: BeatOutcome = { tier: tiers[pick], exec, intensity: opt.intensity };
      outcomes.push(outcome);
      const sc = beatScore(outcome);
      scores.push(sc);
      heat = excitement(scores);
      await crowdAnswer(sc);
    }
    const kimeHit = await runKime();
    overlay.remove();
    onDone(applyKime(finalize(outcomes, perfects, hits, steps), kimeHit));
  }

  renderCrowd();
  q<HTMLButtonElement>(".ls-go").addEventListener("click", () => { startEl.hidden = true; void play(); });
}

export { applyStageResult, stageGrade };
