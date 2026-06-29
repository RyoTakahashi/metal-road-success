// Core data model for Metal Road ~Success!~ (vertical-slice prototype).
// Mirrors docs/design.md and docs/core-loop.md.

/** Main-member skill parameters (体力 is tracked separately as a resource). */
export type Param = "T" | "P" | "S" | "V";

/** Fan-base segments (MVP: 4 kinds). See core-loop.md §3. */
export type Segment = "core" | "light" | "visual" | "expert";

export const PARAMS: Param[] = ["T", "P", "S", "V"];
export const SEGMENTS: Segment[] = ["core", "light", "visual", "expert"];

/** Human-readable labels (Japanese, Powerpro-style). */
export const PARAM_LABEL: Record<Param, string> = {
  T: "演奏基礎",
  P: "パフォーマンス",
  S: "音楽センス",
  V: "ビジュ力",
};

export const SEGMENT_LABEL: Record<Segment, string> = {
  core: "コア",
  light: "ライト",
  visual: "ビジュ",
  expert: "玄人",
};

/** A playing band member. */
export interface Member {
  name: string;
  part: string; // Vo / Gt / Ba / Dr ...
  T: number;
  P: number;
  S: number;
  V: number;
  stamina: number; // 0–100
}

/** Support staff effects, pre-aggregated for the slice. See core-loop.md §2.4. */
export interface Support {
  mk: number; // marketing reach bonus (Mk)
  sn: number; // SNS buzz bonus (Sn)
}

/** A song the band can perform / release. */
export interface Song {
  name: string;
  lean: Record<Segment, number>; // who it leans toward (sums to ~1)
  Q: number; // completion / quality 0–100
}

/** Sugoroku board space kinds. */
export type SpaceKind =
  | "practice" // gain exp toward a focused param
  | "rest" // restore stamina
  | "money" // gain funds
  | "fan" // small fan bump
  | "event" // random band event
  | "live"; // month-end big node

export interface Space {
  kind: SpaceKind;
  param?: Param; // for practice spaces
  label: string;
  /** Fixed events (e.g. LIVE) are always visible and fire on pass-through. */
  fixed: boolean;
  /** Hidden spaces show "?" until the band lands on them and they fire. */
  revealed: boolean;
}

export interface GameState {
  month: number;
  members: Member[];
  support: Support;
  songs: Song[];
  funds: number;
  totalFans: number;
  segFans: Record<Segment, number>;
  fame: number; // 0–100
  board: Space[];
  pos: number; // index on board
  log: string[];
}

/** One stat change to surface in the landing animation. */
export interface EventDelta {
  label: string;
  value: string; // pre-formatted, e.g. "+1" / "+¥20,000" / "UP"
  dir: "up" | "down" | "info";
}

/** Result of landing on (or passing through) a space. */
export interface EventOutcome {
  icon: string;
  title: string;
  deltas: EventDelta[];
  reachedLive: boolean;
}

/** One panel of a story slideshow (event narration). */
export interface Slide {
  art: string; // big emoji / illustration for the scene
  text: string;
  speaker?: string; // member name when it's a line of dialogue
}

/** Practice outcome = stat changes (for the board floats) + a slideshow. */
export interface PracticeResult {
  outcome: EventOutcome;
  slides: Slide[];
}

/** Player choices for a live. */
export interface LiveDecision {
  cap: number; // venue capacity
  target: Segment; // target fan segment
  songIndex: number;
}

/** Outcome of resolving a live — the 4 KPIs plus economics. */
export interface LiveResult {
  draw: number;
  capacity: number;
  occupancy: number;
  soldOut: boolean;
  satisfaction: number;
  newFans: number;
  streams: number;
  revenue: number;
  cost: number;
  profit: number;
}
