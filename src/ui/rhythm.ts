// Live rhythm mini-game — the on-screen, real-time player. Pure-logic beatmap &
// scoring live in src/game/rhythm.ts. Dual input: the RIGHT hand taps two
// falling-note lanes (keys J / K, or taps on the right half of the screen); the
// LEFT hand fires staging commands during "chance" windows (keys A / S, or the
// two command buttons on the left). Runs on an internal monotonic clock (BGM is
// atmosphere, not a synced chart), so device audio latency doesn't hurt timing.
// Mounts a full-screen overlay on document.body and tears it down on finish.

import { L } from "../game/i18n";
import { segLabel } from "../game/types";
import type { GameState, LiveDecision } from "../game/types";
import {
  generateBeatmap,
  RK,
  STAGING_FOR,
  type RhythmNote,
  type RhythmResult,
  type StagingCue,
  type StagingStyle,
} from "../game/rhythm";

interface LiveNote extends RhythmNote { judged: boolean }
interface LiveCue extends StagingCue { resolved: boolean; hit: boolean }

const LANE_KEY: Record<string, 0 | 1> = { j: 0, k: 1, J: 0, K: 1 };
const CMD_KEY: Record<string, StagingStyle> = { a: "hype", s: "show", A: "hype", S: "show" };

/** Run one performance. Calls `onDone(result)` once, after teardown. */
export function runRhythm(
  state: GameState,
  decision: LiveDecision,
  onDone: (res: RhythmResult) => void,
): void {
  const beatmap = generateBeatmap((Date.now() ^ (state.month * 2654435761)) >>> 0, decision);

  // --- DOM scaffold -------------------------------------------------------
  const overlay = document.createElement("div");
  overlay.className = "rg-overlay";
  overlay.innerHTML = `
    <canvas class="rg-canvas"></canvas>
    <div class="rg-hud">
      <div class="rg-combo"></div>
      <div class="rg-judge"></div>
    </div>
    <div class="rg-target">${L("今日の客層", "Tonight's crowd")}: <b>${segLabel(decision.target)}</b></div>
    <div class="rg-chance" hidden></div>
    <div class="rg-cmds">
      <button class="rg-cmd" data-style="hype"><b>${L("あおる", "HYPE")}</b><small>A</small></button>
      <button class="rg-cmd" data-style="show"><b>${L("魅せる", "SHOW")}</b><small>S</small></button>
    </div>
    <div class="rg-start">
      <h2>${L("🎤 ライブ本番！", "🎤 Showtime!")}</h2>
      <p>${L("右手＝リズム：ノーツがラインに来たら <b>J / K</b>（右側タップ）", "Right hand = rhythm: hit <b>J / K</b> (tap the right side) as notes reach the line")}</p>
      <p>${L("左手＝ステージング：チャンス時に <b>あおる(A) / 魅せる(S)</b>", "Left hand = staging: on a CHANCE, press <b>HYPE (A) / SHOW (S)</b>")}</p>
      <p class="rg-hint">${L("コア・ライト＝あおる／ビジュ・玄人＝魅せる。今日の客層に合わせて！", "Core & Casual → HYPE / Visual & Connoisseur → SHOW. Match tonight's crowd!")}</p>
      <button class="rg-go btn">${L("▶ スタート", "▶ Start")}</button>
    </div>`;
  document.body.appendChild(overlay);

  const canvas = overlay.querySelector<HTMLCanvasElement>(".rg-canvas")!;
  const ctx = canvas.getContext("2d")!;
  const comboEl = overlay.querySelector<HTMLDivElement>(".rg-combo")!;
  const judgeEl = overlay.querySelector<HTMLDivElement>(".rg-judge")!;
  const chanceEl = overlay.querySelector<HTMLDivElement>(".rg-chance")!;
  const startEl = overlay.querySelector<HTMLDivElement>(".rg-start")!;
  const cmdEls = Array.from(overlay.querySelectorAll<HTMLButtonElement>(".rg-cmd"));

  let W = 0, H = 0, dpr = 1;
  function resize(): void {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = overlay.clientWidth; H = overlay.clientHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener("resize", resize);

  // --- state --------------------------------------------------------------
  const notes: LiveNote[] = beatmap.notes.map((n) => ({ ...n, judged: false }));
  const cues: LiveCue[] = beatmap.cues.map((c) => ({ ...c, resolved: false, hit: false }));
  let perfect = 0, good = 0, miss = 0, combo = 0, maxCombo = 0;
  let startTs = 0;
  let raf = 0;
  let running = false;

  const laneX = (lane: 0 | 1): number => {
    // right half holds the two lanes
    const half = W / 2;
    const laneW = half / 2;
    return half + laneW * lane + laneW / 2;
  };
  const HIT_Y = (): number => H * 0.82;
  const NOTE_W = (): number => Math.min(120, (W / 2) / 2 - 16);

  function flashJudge(txt: string, cls: string): void {
    judgeEl.textContent = txt;
    judgeEl.className = "rg-judge " + cls;
    judgeEl.style.opacity = "1";
    setTimeout(() => { judgeEl.style.opacity = "0"; }, 260);
  }

  function hitLane(lane: 0 | 1): void {
    if (!running) return;
    const now = performance.now() - startTs;
    // nearest unjudged note in this lane
    let best: LiveNote | null = null;
    let bestDt = Infinity;
    for (const n of notes) {
      if (n.judged || n.lane !== lane) continue;
      const dt = Math.abs(n.t - now);
      if (dt < bestDt) { bestDt = dt; best = n; }
    }
    if (!best || bestDt > RK.goodMs) { flashJudge(L("空振り", "Whiff"), "miss"); combo = 0; return; }
    best.judged = true;
    if (bestDt <= RK.perfectMs) { perfect++; combo++; flashJudge("PERFECT", "perfect"); }
    else { good++; combo++; flashJudge("GOOD", "good"); }
    maxCombo = Math.max(maxCombo, combo);
    pulseLane(lane);
  }

  let lanePulse: [number, number] = [0, 0];
  function pulseLane(lane: 0 | 1): void { lanePulse[lane] = performance.now(); }

  function fireCmd(style: StagingStyle): void {
    if (!running) return;
    const now = performance.now() - startTs;
    const cue = cues.find((c) => !c.resolved && now >= c.t && now <= c.t + c.windowMs);
    if (!cue) { flashJudge(L("まだ早い", "Too soon"), "miss"); return; }
    cue.resolved = true;
    cue.hit = STAGING_FOR[cue.target] === style;
    if (cue.hit) { combo += 2; maxCombo = Math.max(maxCombo, combo); flashJudge(L("ドンピシャ！", "NAILED IT!"), "perfect"); }
    else { combo = 0; flashJudge(L("客層ミス", "Wrong crowd"), "miss"); }
  }

  // --- input --------------------------------------------------------------
  function onKey(e: KeyboardEvent): void {
    if (e.repeat) return;
    if (e.key in LANE_KEY) { hitLane(LANE_KEY[e.key]); e.preventDefault(); }
    else if (e.key in CMD_KEY) { fireCmd(CMD_KEY[e.key]); e.preventDefault(); }
  }
  function onPointer(e: PointerEvent): void {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < W / 2) return; // left half = command buttons (handled by DOM)
    hitLane(x > W * 0.75 ? 1 : 0);
  }
  window.addEventListener("keydown", onKey);
  canvas.addEventListener("pointerdown", onPointer);
  cmdEls.forEach((b) =>
    b.addEventListener("pointerdown", (e) => { e.preventDefault(); fireCmd(b.dataset.style as StagingStyle); }),
  );

  // --- draw loop ----------------------------------------------------------
  function draw(): void {
    const now = performance.now() - startTs;
    ctx.clearRect(0, 0, W, H);
    // playfield split
    ctx.fillStyle = "#0b0e18";
    ctx.fillRect(0, 0, W, H);
    // lane guides (right half)
    const hitY = HIT_Y();
    const nw = NOTE_W();
    for (let lane = 0 as 0 | 1; lane <= 1; lane = (lane + 1) as 0 | 1) {
      const cx = laneX(lane);
      ctx.fillStyle = "#121a2e";
      ctx.fillRect(cx - nw / 2 - 2, 0, nw + 4, H);
      // hit pad
      const since = performance.now() - lanePulse[lane];
      const glow = Math.max(0, 1 - since / 160);
      ctx.strokeStyle = `rgba(255,85,119,${0.5 + 0.5 * glow})`;
      ctx.lineWidth = 3 + 6 * glow;
      ctx.strokeRect(cx - nw / 2, hitY - 10, nw, 20);
    }
    // hit line
    ctx.strokeStyle = "rgba(255,255,255,0.75)";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(W / 2, hitY); ctx.lineTo(W, hitY); ctx.stroke();
    // notes
    for (const n of notes) {
      if (n.judged) continue;
      const dt = n.t - now; // >0 = above the line, approaching
      if (dt > RK.leadMs) continue;
      if (dt < -RK.goodMs) { n.judged = true; miss++; combo = 0; flashJudge("MISS", "miss"); continue; }
      const prog = 1 - dt / RK.leadMs; // 0 at spawn, 1 at hit line
      const y = prog * hitY;
      const cx = laneX(n.lane);
      ctx.fillStyle = n.lane === 0 ? "#ff5577" : "#54c7ff";
      roundRect(ctx, cx - nw / 2, y - 12, nw, 24, 8);
      ctx.fill();
    }
    // left-half label
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.font = "600 13px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(L("← ステージング", "← STAGING"), W * 0.25, H * 0.5);
    ctx.fillText(L("リズム →", "RHYTHM →"), W * 0.75, 28);

    // staging chance banner
    const openCue = cues.find((c) => !c.resolved && now >= c.t && now <= c.t + c.windowMs);
    if (openCue) {
      const style = STAGING_FOR[openCue.target];
      chanceEl.hidden = false;
      chanceEl.innerHTML = `⚡ CHANCE ⚡<br>${segLabel(openCue.target)} → <b>${style === "hype" ? L("あおる(A)", "HYPE (A)") : L("魅せる(S)", "SHOW (S)")}</b>`;
      cmdEls.forEach((b) => b.classList.add("live"));
    } else {
      chanceEl.hidden = true;
      cmdEls.forEach((b) => b.classList.remove("live"));
    }
    comboEl.textContent = combo >= 3 ? `${combo} COMBO` : "";

    if (now >= beatmap.durationMs + 400) { finish(); return; }
    raf = requestAnimationFrame(draw);
  }

  function countdownThenStart(): void {
    startEl.hidden = true;
    let n = 3;
    const cd = document.createElement("div");
    cd.className = "rg-count";
    overlay.appendChild(cd);
    const tick = (): void => {
      cd.textContent = n > 0 ? String(n) : L("GO!", "GO!");
      if (n < 0) { cd.remove(); begin(); return; }
      n -= 1;
      setTimeout(tick, 600);
    };
    tick();
  }
  function begin(): void {
    startTs = performance.now();
    running = true;
    raf = requestAnimationFrame(draw);
  }
  function finish(): void {
    running = false;
    cancelAnimationFrame(raf);
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("resize", resize);
    overlay.remove();
    const notesTotal = notes.length;
    const accuracy = notesTotal ? (perfect + good * 0.5) / notesTotal : 0;
    const stagingHits = cues.filter((c) => c.hit).length;
    const res: RhythmResult = {
      notesTotal, perfect, good, miss, maxCombo,
      accuracy, stagingTotal: cues.length, stagingHits,
    };
    onDone(res);
  }

  overlay.querySelector<HTMLButtonElement>(".rg-go")!.addEventListener("click", countdownThenStart);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
