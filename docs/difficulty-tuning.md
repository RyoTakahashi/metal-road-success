# Difficulty tuning — game-over rate targeting

Goal: an intermediate player should **fail (disband) ~30–40% of runs**. This
was tuned with a headless simulator that drives the real game code, so the
numbers below are produced by exactly what ships.

## Result

Across 5 independent 500-run seed sets: **32.2% – 38.6% game-over** (≈36% at
1500 runs), with failures spread across the later checkpoints and growing
toward the finale — not a single end-game wall:

| Checkpoint (deadline) | share of failures (1500 runs) |
|---|---|
| ① Proving-Ground (mo 7) | 0% |
| ② Indie Fest (mo 13) | ~17% |
| ③ Major Debut (mo 21) | ~19% |
| ④ Major Festival (mo 32) | ~29% |
| ⑤ Overseas (mo 46) | ~35% |

Economic collapse (can't afford any venue → wasted month) is a minor,
intentional texture (~1% of lives), not the dominant failure mode; most
losses are genuine fan/fame/time shortfalls — the "背伸び" (overreach) tension.

## What changed (the levers)

All difficulty knobs now live in one place, the balance table `K` in
`src/game/coreLoop.ts`, plus the `MILESTONES` ladder in `src/game/state.ts`.

**Live satisfaction (harsher — the master dial).** Satisfaction drives fans
(superlinearly) *and* profit together, so it's the highest-leverage knob.
A default show now rates **B**; an **A** takes real setup (appeal + song match
+ a filled venue).

| K field | before | after |
|---|---|---|
| `satAppeal` | 0.55 | **0.455** |
| `satMatch`  | 0.30 | **0.25** |
| `satAtmos`  | 0.15 | **0.125** |

**Economy (cash is now a real constraint).** Paired with the new rule that a
paid action is unavailable when broke (金欠＝行動不可, see `canAfford` /
`cardUnaffordable` in `state.ts`).

| K field | before | after |
|---|---|---|
| `feePractice` | ¥8,000 | **¥12,000** |
| `venueCostPerSeat` | ¥1,300 | **¥1,500** |
| `baitMin` / `baitVar` (part-time) | 40k / 30k | **35k / 25k** |

**Checkpoint ladder (tighter deadlines + higher bars).** Compresses time and
raises the fan/fame targets so the middle game bites too.

| # | before (deadline · power · fans · other) | after |
|---|---|---|
| ① | 8 · 52 · 1,600 | **7 · 54 · 2,000** |
| ② | 15 · 58 · 3,200 · songs 3 | **13 · 60 · 4,200 · songs 3** |
| ③ | 24 · 66 · 6,000 · bond 50 | **21 · 68 · 7,800 · bond 50** |
| ④ | 36 · 74 · 14,000 · fame 64 | **32 · 76 · 17,000 · fame 66** |
| ⑤ | 50 · 80 · 36,000 · fame 78 | **46 · 82 · 39,000 · fame 80** |

**Not changed:** `practiceGain` (still 6). Power is never the binding
constraint for the policy — fans, fame, cash and time are — so lowering it
would only add grind without moving the failure rate. Left as-is.

## Re-running the simulator

```
npm run sim -- [runs] [seed0]
npm run sim -- 500 1
# sweep a config without editing source (overrides K and/or milestones):
node node_modules/.cache/sim.mjs 500 1 --config '{"K":{"satAppeal":0.47}}'
node node_modules/.cache/sim.mjs 500 1 --config '{"milestones":{"4":{"deadline":48,"req":{"fans":38000}}}}'
```

The policy (`scripts/sim.ts`) is a greedy, per-turn intermediate-player
heuristic from the difficulty-policy doc (chapter D): fund-safe part-time when
low, address the most-urgent checkpoint deficit, target the segment the band
is strong in, book the **largest affordable venue that still rates A**, and use
items opportunistically (permanent stat-ups aggressively, HP items before a
forced rest, practice multipliers before a practice, a satisfaction item on a
big/checkpoint live). Staff hiring is excluded, per the reviewed policy.

To re-tune: satisfaction coefficients move the *total* rate the most; the
milestone ladder shapes *where* in the run failures land.
