// Headless auto-play simulator for difficulty tuning (see the difficulty-policy
// doc). It drives the REAL game code (state.ts / coreLoop.ts / market.ts) with
// the chapter-D decision policy, so tuning the balance table (coreLoop K,
// MILESTONES) is measured by exactly the code that ships.
//
// Usage:
//   node <bundle> [runs] [seed]         → prints a metrics report
//   node <bundle> --config '<json>'     → overrides K / milestone fields first
//
// The policy is a greedy, per-turn heuristic approximating an intermediate
// player: pick the action that most helps the most-urgent checkpoint deficit,
// keep enough cash to play an A-rated show, and use items opportunistically.

import {
  advanceTurn, buildAfterPartyScenes, buildLivePreScenes, buildLiveReactionScenes,
  buildTieupOfferScenes, canAfford, checkProgress, composeSong, currentMilestone,
  dealHand, isCardLocked, maybeFindItem, newGame, nextTurnEvent, PARTS, registerLiveEvolution,
  reqValue, resolveAction, resolveTieupAccept, resolveTieupDecline, startNewMonth, useItem,
  MILESTONES, bandStamina,
} from "../src/game/state";
import { appealAdj, applyLiveResult, K, resolveLive, songMatch } from "../src/game/coreLoop";
import { applyLiveToMarket, marketFanMult, OPPOSED } from "../src/game/market";
import type { GameState, LiveDecision, Param, Scene, Segment } from "../src/game/types";
import { SEGMENTS } from "../src/game/types";

// ---- seeded RNG (mulberry32) -----------------------------------------------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- item classification (for the item policy) -----------------------------
const STAT_UP = ["baaaan", "studJacket", "hyperMetronome", "bloodLetter", "metalGodProof"];
const PRACTICE_MULT = ["hyperMetronome", "silentGuitar", "hellTraining", "jackDaniels"]; // used before a practice
const HP_ITEM = "metalianD";
const has = (s: GameState, id: string) => (s.items[id] ?? 0) > 0;

// ---- deterministic live prediction (mirrors resolveLive w/ noise=1) --------
function predict(state: GameState, cap: number, target: Segment, songIndex: number) {
  const song = state.songs[songIndex];
  const freshMult = K.freshnessFloor + K.freshnessRange * (state.practiceFreshness / 100);
  const songFreshMult = Math.max(K.songFreshFloor, 1 - K.songStalePerMonth * song.age);
  const aAdj = appealAdj(state, target) * freshMult;
  const match = songMatch(song, target);
  const exposure = 1 + state.support.mk + state.support.sn;
  const expDraw = state.segFans[target] * K.drawLoyalty * (aAdj / K.drawAppealPivot) * exposure + state.totalFans * K.fameWalkupRate;
  const draw = Math.min(Math.round(expDraw), cap);
  const occupancy = cap > 0 ? draw / cap : 0;
  let atmosphere = 100 * occupancy;
  if (draw >= cap) atmosphere = Math.min(100, atmosphere + K.selloutBonus);
  const avgLove = state.members.reduce((a, m) => a + m.love, 0) / (state.members.length || 1);
  const loveBonus = K.loveSatCoef * (avgLove / 100);
  const sat = Math.max(0, Math.min(100, K.satAppeal * aAdj + K.satMatch * match * 100 + K.satAtmos * atmosphere + state.buffs.liveSat + loveBonus));
  const satFactor = Math.max(0.08, Math.min(1.1, K.satFactorBase + (sat - K.satFactorMid) * K.satFactorSlope));
  const streams = state.totalFans * K.streamPerFan * (song.Q / K.streamQPivot) * (1 + state.support.sn) * (sat / K.streamSatPivot) * songFreshMult;
  const revenue = draw * K.ticketPrice * satFactor + streams * K.streamRate;
  const profit = revenue - cap * K.venueCostPerSeat;
  const newFans = cap * K.fanCapCoef * Math.pow(sat / 100, K.fanQualExp) + state.segFans[target] * K.fanSegCoef * (sat / 100);
  return { sat, draw, occupancy, profit, newFans: newFans * marketFanMult(state, target) };
}

// Best (target, song) for the band right now: strong appeal × market × best song.
function bestTargetSong(state: GameState): { target: Segment; songIndex: number } {
  let best = { target: SEGMENTS[0], songIndex: 0, score: -1 };
  for (const seg of SEGMENTS) {
    let si = 0, sm = -1;
    state.songs.forEach((sg, i) => { const m = songMatch(sg, seg); if (m > sm) { sm = m; si = i; } });
    const score = appealAdj(state, seg) * marketFanMult(state, seg) * (0.5 + sm);
    if (score > best.score) best = { target: seg, songIndex: si, score };
  }
  return { target: best.target, songIndex: best.songIndex };
}

const capsFor = (state: GameState): number[] => (state.rank === "major" ? [500, 1200, 2500] : [150, 500, 1200]);

// Venue policy (revised E-1): largest AFFORDABLE venue that still rates A
// (sat ≥ 70). If none reach A, the venue with the highest predicted sat
// (naturally the smallest, best-occupancy, safest). null if we can't afford any.
function chooseLive(state: GameState): LiveDecision | null {
  const { target, songIndex } = bestTargetSong(state);
  const affordable = capsFor(state).filter((c) => state.funds >= c * K.venueCostPerSeat);
  if (affordable.length === 0) return null;
  const aVenues = affordable.filter((c) => predict(state, c, target, songIndex).sat >= 70);
  if (aVenues.length) return { cap: Math.max(...aVenues), target, songIndex };
  let bestCap = affordable[0], bestSat = -1;
  for (const c of affordable) { const p = predict(state, c, target, songIndex).sat; if (p > bestSat) { bestSat = p; bestCap = c; } }
  return { cap: bestCap, target, songIndex };
}

// Smallest cash needed to play a show at all (the cheapest venue on our tier).
const minVenueCost = (state: GameState): number => Math.min(...capsFor(state)) * K.venueCostPerSeat;

// ---- focus metric (chapter D-1): most-urgent checkpoint deficit ------------
const PER_TURN_GAIN: Record<string, number> = { power: 1.5, fans: 130, songs: 1, bond: 6, fame: 3 };
function focus(state: GameState): keyof typeof PER_TURN_GAIN | null {
  const m = currentMilestone(state);
  if (!m) return null;
  const remTurns = Math.max(1, (m.deadline - state.month) * state.turnsPerMonth + (state.turnsPerMonth - state.turn));
  let best: string | null = null, bestRatio = -1;
  for (const key of Object.keys(m.req) as (keyof typeof m.req)[]) {
    const deficit = Math.max(0, (m.req[key] ?? 0) - reqValue(state, key));
    if (deficit <= 0) continue;
    const ratio = deficit / PER_TURN_GAIN[key] / remTurns;
    if (ratio > bestRatio) { bestRatio = ratio; best = key; }
  }
  return best as keyof typeof PER_TURN_GAIN | null;
}

// Which practice param best serves the target segment's appeal weights.
import { SEG_WEIGHTS } from "../src/game/coreLoop";
function bestParamFor(target: Segment): Param {
  const w = SEG_WEIGHTS[target];
  return (["T", "P", "S", "V"] as Param[]).reduce((a, b) => (w[b] > w[a] ? b : a), "T");
}

// ---- scene walker: apply choice #0 (bond/love/stat/MC effects) --------------
function walk(state: GameState, scenes: Scene[] | null): void {
  if (!scenes) return;
  const list = [...scenes];
  for (let i = 0; i < list.length; i++) {
    const sc = list[i];
    if (sc.choices?.length) {
      const choice = sc.choices[0];
      choice.apply?.(state);
      if (choice.next?.length) list.splice(i + 1, 0, ...choice.next);
    }
  }
}

const hand = (state: GameState) => state.hand.filter((c) => !isCardLocked(state, c.kind));
const inHand = (state: GameState, kind: string) => hand(state).some((c) => c.kind === kind);

// ---- item usage ------------------------------------------------------------
function usePermanentItems(state: GameState, rng: () => number): void {
  for (const id of STAT_UP) {
    if (!has(state, id)) continue;
    if (id === "bloodLetter" && bandStamina(state) < 55) continue; // costs 20 stamina
    useItem(state, id, rng);
  }
}
function usePracticeItem(state: GameState, rng: () => number): void {
  const id = PRACTICE_MULT.find((x) => has(state, x));
  if (id) useItem(state, id, rng);
}

// ---- one action turn -------------------------------------------------------
function playTurn(state: GameState, rng: () => number): void {
  usePermanentItems(state, rng);

  // Stamina guard (D-0): HP item, else rest.
  if (bandStamina(state) < 30) {
    while (bandStamina(state) < 30 && has(state, HP_ITEM)) useItem(state, HP_ITEM, rng);
    if (bandStamina(state) < 30) { walk(state, resolveAction(state, "rest", "full", undefined, rng).scenes); return; }
  }

  const f = focus(state);
  const { target } = bestTargetSong(state);

  // Fund safety (D-2): keep enough to play a show; bait when low if possible.
  const floor = minVenueCost(state) * 1.15 + 20000;
  if (state.funds < floor && inHand(state, "money")) { walk(state, resolveAction(state, "money", undefined, undefined, rng).scenes); afterAction(state, rng); return; }

  // Pick an action for the focus (fall back through productive options).
  const act = pickAction(state, f, target);
  execute(state, act, target, rng);
}

type Act = { kind: string; sub?: string; param?: Param };
function pickAction(state: GameState, f: string | null, target: Segment): Act {
  const wantCompose = f === "songs";
  const musicSub = (sub: string) => canAfford(state, "music", sub);
  const cand: Act[] = [];
  if (f === "power" && inHand(state, "music") && musicSub("practice")) cand.push({ kind: "music", sub: "practice", param: bestParamFor(target) });
  if (f === "fans") { if (inHand(state, "music")) cand.push({ kind: "music", sub: "perform" }); if (inHand(state, "promo") && canAfford(state, "promo")) cand.push({ kind: "promo" }); }
  if (wantCompose && inHand(state, "music") && musicSub("compose")) cand.push({ kind: "music", sub: "compose" });
  if (f === "bond" && inHand(state, "network")) cand.push({ kind: "network", sub: "band" });
  if (f === "fame") { if (inHand(state, "promo") && canAfford(state, "promo")) cand.push({ kind: "promo" }); if (inHand(state, "network")) cand.push({ kind: "network", sub: "contact" }); }
  // Fallbacks: practice > perform > promo > compose > bond > contact > bait > rest.
  if (inHand(state, "music") && musicSub("practice")) cand.push({ kind: "music", sub: "practice", param: bestParamFor(target) });
  if (inHand(state, "music")) cand.push({ kind: "music", sub: "perform" });
  if (inHand(state, "promo") && canAfford(state, "promo")) cand.push({ kind: "promo" });
  if (inHand(state, "network")) cand.push({ kind: "network", sub: "band" });
  if (inHand(state, "money")) cand.push({ kind: "money" });
  cand.push({ kind: "rest", sub: "full" });
  return cand[0];
}

function execute(state: GameState, act: Act, target: Segment, rng: () => number): void {
  if (act.kind === "music" && act.sub === "practice") usePracticeItem(state, rng);
  if (act.kind === "music" && act.sub === "compose") { composeSong(state, target, rng); afterAction(state, rng); return; }
  walk(state, resolveAction(state, act.kind as any, act.sub, act.param, rng).scenes);
  afterAction(state, rng);
}
function afterAction(state: GameState, rng: () => number): void { walk(state, maybeFindItem(state, rng)); }

// ---- month-end live --------------------------------------------------------
function doLive(state: GameState, rng: () => number): { satisfaction: number } | null {
  const dec = chooseLive(state);
  if (!dec) return null; // broke: no affordable venue → wasted month
  const near = state.month >= (currentMilestone(state)?.deadline ?? 99) - 1; // checkpoint push
  if (dec.cap >= 500 && has(state, "batThing")) useItem(state, "batThing", rng);
  else if (near && has(state, "batThing")) useItem(state, "batThing", rng);
  walk(state, buildLivePreScenes(state, dec, rng));
  const result = resolveLive(state, dec, rng);
  applyLiveResult(state, dec, result);
  registerLiveEvolution(state, dec.target, result.satisfaction);
  applyLiveToMarket(state, dec.target, result.satisfaction);
  return result;
}

function decideTieup(state: GameState): void {
  const t = state.tieupOffer;
  if (!t) return;
  const { target } = bestTargetSong(state);
  // Accept unless it locks the image against our current focus segment.
  if (OPPOSED[t.seg] === target) resolveTieupDecline(state);
  else resolveTieupAccept(state);
}

// ---- one full game ---------------------------------------------------------
interface Outcome { result: "clear" | "gameover" | "stall"; stage: number; month: number; missedLives: number; finalFunds: number; }
function simulate(seed: number): Outcome {
  const rng = mulberry32(seed);
  const part = PARTS[Math.floor(rng() * PARTS.length)].part;
  const state = newGame(part, "", rng);
  let missedLives = 0;

  for (let guard = 0; guard < 400; guard++) {
    // action turns until the month's live
    while (true) {
      playTurn(state, rng);
      const nx = advanceTurn(state, rng);
      if (nx === "live") break;
      walk(state, nextTurnEvent(state, rng));
    }
    const result = doLive(state, rng);
    if (!result) missedLives++;
    else { walk(state, buildLiveReactionScenes(state, result as any, rng)); walk(state, buildAfterPartyScenes(state, result as any, rng)); }

    startNewMonth(state, rng);
    const prog = checkProgress(state);
    if (prog.kind === "gameover") return { result: "gameover", stage: state.stage, month: state.month, missedLives, finalFunds: state.funds };
    if (prog.kind === "clear") return { result: "clear", stage: state.stage, month: state.month, missedLives, finalFunds: state.funds };
    if (state.tieupOffer) decideTieup(state);
  }
  return { result: "stall", stage: state.stage, month: state.month, missedLives, finalFunds: state.funds };
}

// ---- runner + config override ----------------------------------------------
function applyConfig(cfg: any): void {
  if (!cfg) return;
  if (cfg.K) Object.assign(K as any, cfg.K);
  if (cfg.milestones) {
    for (const [i, patch] of Object.entries(cfg.milestones)) {
      const m = MILESTONES[Number(i)];
      if (!m) continue;
      const p = patch as any;
      if (p.deadline != null) (m as any).deadline = p.deadline;
      if (p.req) Object.assign(m.req, p.req);
    }
  }
}

function main(): void {
  const args = process.argv.slice(2);
  let runs = 500, seed0 = 1, cfg: any = null;
  const pos: number[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--config") cfg = JSON.parse(args[++i]);
    else if (args[i] === "--seed") seed0 = Number(args[++i]);
    else if (!isNaN(Number(args[i]))) pos.push(Number(args[i]));
  }
  if (pos[0] != null) runs = pos[0];
  if (pos[1] != null) seed0 = pos[1];
  applyConfig(cfg);

  const stageDeaths = [0, 0, 0, 0, 0];
  let clears = 0, gameovers = 0, stalls = 0, missed = 0;
  const clearMonths: number[] = [];
  for (let i = 0; i < runs; i++) {
    const o = simulate(seed0 + i * 7919);
    missed += o.missedLives;
    if (o.result === "clear") { clears++; clearMonths.push(o.month); }
    else if (o.result === "gameover") { gameovers++; stageDeaths[o.stage] = (stageDeaths[o.stage] || 0) + 1; }
    else stalls++;
  }
  const pct = (n: number) => ((100 * n) / runs).toFixed(1) + "%";
  const goRate = (gameovers + stalls) / runs;
  console.log(`runs=${runs}  seed0=${seed0}`);
  console.log(`GAME OVER: ${pct(gameovers + stalls)}  (target 30–40%)   [gameover=${gameovers}, stall=${stalls}]`);
  console.log(`CLEAR:     ${pct(clears)}   avg clear month=${clearMonths.length ? (clearMonths.reduce((a, b) => a + b, 0) / clearMonths.length).toFixed(1) : "-"}`);
  console.log(`dropout by checkpoint: ` + MILESTONES.map((m, i) => `${i + 1}:${m.label.slice(0, 6)}=${stageDeaths[i] || 0}`).join("  "));
  console.log(`missed lives (broke): ${missed}`);
  console.log(`GOAL_MET=${goRate >= 0.3 && goRate <= 0.4}`);
}
main();
