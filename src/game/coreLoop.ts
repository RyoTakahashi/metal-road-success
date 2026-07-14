// Core-loop KPI model. Faithful implementation of docs/core-loop.md (v0.1).
// All tunable constants are grouped in K below.

import type {
  GameState,
  LiveDecision,
  LiveResult,
  Member,
  Param,
  Segment,
  Song,
  StaffRole,
} from "./types";
import { PARAMS, SEGMENTS } from "./types";

/** Tunable constants — see core-loop.md §9 (the 【K_*】 markers). */
export const K = {
  conditionFloor: 0.82, // condition at 0 stamina
  conditionRange: 0.18, // added at full stamina
  drawLoyalty: 0.6, // fraction of segment fans that show up
  drawAppealPivot: 50, // appeal value that maps to ×1.0
  fameWalkupRate: 0.05, // general walk-ups = totalFans * this
  selloutBonus: 10, // atmosphere bonus when sold out
  convBase: 0.15, // base conversion rate of attendees -> new fans
  convExp: 1.5, // satisfaction exponent for conversion
  streamPerFan: 3, // base streams contributed per fan
  streamQPivot: 50, // song quality that maps to ×1.0
  streamSatPivot: 60, // satisfaction that maps to ×1.0
  ticketPrice: 4000, // yen per attendee
  streamRate: 0.5, // yen per stream
  venueCostPerSeat: 1200, // venue cost scales with capacity (背伸びの痛み)
  freshnessFloor: 0.7, // live output at 0 practice freshness
  freshnessRange: 0.3, // added at full freshness (D3: practice decay)
  songStalePerMonth: 0.12, // per-month decay of a song's pull (D3: new songs)
  songFreshFloor: 0.4, // floor for a very old song
} as const;

/** Segment appeal weights over the 4 params (rows sum to 1.0). core-loop.md §3. */
export const SEG_WEIGHTS: Record<Segment, Record<Param, number>> = {
  core: { T: 0.35, P: 0.2, S: 0.45, V: 0.0 },
  light: { T: 0.1, P: 0.4, S: 0.2, V: 0.3 },
  visual: { T: 0.05, P: 0.35, S: 0.1, V: 0.5 },
  expert: { T: 0.45, P: 0.05, S: 0.5, V: 0.0 },
};

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

/** Band-level value for a param = mean over main members (core-loop.md §2.1). */
export function bandParam(members: Member[], p: Param): number {
  if (members.length === 0) return 0;
  return members.reduce((sum, m) => sum + m[p], 0) / members.length;
}

/** Average stamina across the band. */
export function avgStamina(members: Member[]): number {
  if (members.length === 0) return 0;
  return members.reduce((sum, m) => sum + m.stamina, 0) / members.length;
}

/** Condition multiplier from stamina (core-loop.md §2.2). */
export function condition(members: Member[]): number {
  return K.conditionFloor + K.conditionRange * (avgStamina(members) / 100);
}

/** Raw appeal of the band to a segment (0–100). */
export function appeal(members: Member[], seg: Segment): number {
  const w = SEG_WEIGHTS[seg];
  return PARAMS.reduce((sum, p) => sum + w[p] * bandParam(members, p), 0);
}

/** Condition-adjusted appeal. */
export function appealAdj(state: GameState, seg: Segment): number {
  return appeal(state.members, seg) * condition(state.members);
}

/** Song match toward a target segment (0–1): lean × quality. */
export function songMatch(song: Song, target: Segment): number {
  return song.lean[target] * (song.Q / 100);
}

/**
 * Resolve a live performance into the 4 KPIs + economics.
 * `rng` defaults to Math.random (injectable for tests/determinism).
 */
export function resolveLive(
  state: GameState,
  decision: LiveDecision,
  rng: () => number = Math.random,
): LiveResult {
  const { cap, target, songIndex } = decision;
  const song = state.songs[songIndex];

  // D3: rusty practice drags the whole live down; stale songs pull fewer people.
  const freshMult = K.freshnessFloor + K.freshnessRange * (state.practiceFreshness / 100);
  const songFreshMult = Math.max(K.songFreshFloor, 1 - K.songStalePerMonth * song.age);

  // Staff effects (P2): manager lifts reach, PA lifts satisfaction (but a
  // low-intimacy PA risks equipment trouble; a roadie mitigates it).
  const find = (r: StaffRole) => state.staff.find((s) => s.role === r);
  const manager = find("manager");
  const pa = find("pa");
  const roadie = find("roadie");
  const managerMk = manager ? 0.15 * (manager.intimacy / 100) : 0;

  const aAdj = appealAdj(state, target) * freshMult; // Appeal_adj[t], practice-adjusted
  const match = songMatch(song, target); // SongMatch(t) 0–1
  const exposure = 1 + state.support.mk + managerMk + state.support.sn;

  // Step 2: expected -> actual draw (capped by venue).
  const expDraw =
    state.segFans[target] * K.drawLoyalty * (aAdj / K.drawAppealPivot) * exposure +
    state.totalFans * K.fameWalkupRate;
  const noise = 0.9 + rng() * 0.2; // ×0.9–1.1
  const draw = Math.min(Math.round(expDraw * noise), cap);
  const occupancy = cap > 0 ? draw / cap : 0;
  const soldOut = draw >= cap;

  // Step 3: atmosphere.
  let atmosphere = 100 * occupancy;
  if (soldOut) atmosphere = Math.min(100, atmosphere + K.selloutBonus);

  // Step 4: satisfaction (KPI ①), plus PA lift and low-intimacy trouble.
  const paBonus = pa ? 10 * (pa.intimacy / 100) : 0;
  let trouble = false;
  if (pa && pa.intimacy < 40) {
    const chance = roadie ? 0.25 : 0.5; // a roadie halves the trouble odds
    trouble = rng() < chance;
  }
  const satisfaction = clamp(
    0.55 * aAdj + 0.3 * match * 100 + 0.15 * atmosphere + paBonus - (trouble ? 18 : 0),
  );

  // Step 5: new fans (KPI ②).
  const convRate =
    K.convBase * Math.pow(satisfaction / 100, K.convExp) * (1 + state.support.sn);
  const newFans = Math.round(draw * convRate * songFreshMult);

  // Step 6: streams (KPI ③).
  const streams = Math.round(
    state.totalFans *
      K.streamPerFan *
      (song.Q / K.streamQPivot) *
      (1 + state.support.sn) *
      (satisfaction / K.streamSatPivot) *
      songFreshMult,
  );

  // Step 7: economics — staff take a cut of revenue as 人件費 (利益分散).
  const revenue = draw * K.ticketPrice + streams * K.streamRate;
  const staffCost = Math.round(revenue * state.staff.reduce((a, s) => a + s.cut, 0));
  const cost = cap * K.venueCostPerSeat + staffCost;
  const profit = revenue - cost;

  return {
    draw,
    capacity: cap,
    occupancy,
    soldOut,
    satisfaction,
    newFans,
    streams,
    revenue,
    cost,
    staffCost,
    trouble,
    profit,
  };
}

/** Apply a resolved live to the game state (mutates). */
export function applyLiveResult(
  state: GameState,
  decision: LiveDecision,
  result: LiveResult,
): void {
  state.segFans[decision.target] += result.newFans;
  state.totalFans += result.newFans;
  state.funds += Math.round(result.profit);
  state.fame = clamp(state.fame + result.newFans / 100);

  // Producer wants scale/branding: booking below their target erodes intimacy.
  const producer = state.staff.find((s) => s.role === "producer");
  if (producer) {
    const targetCap = state.rank === "major" ? 1200 : 500;
    producer.intimacy =
      decision.cap >= targetCap
        ? Math.min(100, producer.intimacy + 6)
        : Math.max(0, producer.intimacy - 12);
  }
}

/** Convenience: appeal across all segments (for UI display). */
export function appealProfile(state: GameState): Record<Segment, number> {
  const out = {} as Record<Segment, number>;
  for (const s of SEGMENTS) out[s] = Math.round(appealAdj(state, s));
  return out;
}
