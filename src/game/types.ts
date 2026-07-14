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
  name: string; // display name (leader may be renamed)
  artKey: string; // sprite key: ryo/ken/mio/go (never changes)
  part: string; // Vo / Gt / Ba / Dr ...
  isLeader: boolean; // the player controls this member
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
  age: number; // months since release (0 = brand new); older = stale
}

/** Turn action categories (the choice-card hand). See docs/phase1-cards.md. */
export type ActionKind = "rest" | "music" | "promo" | "network" | "money";

export const ACTION_LABEL: Record<ActionKind, string> = {
  rest: "休息",
  music: "音楽活動",
  promo: "広報活動",
  network: "関係性構築",
  money: "アルバイト",
};
export const ACTION_ICON: Record<ActionKind, string> = {
  rest: "💤",
  music: "🎸",
  promo: "📣",
  network: "🤝",
  money: "💴",
};

/** A card offered in the turn's hand. */
export interface ActionCard {
  kind: ActionKind;
  /** Sub-option chosen when the card is played (music/rest/network have subs). */
  subs?: { id: string; label: string; desc: string }[];
}

export interface GameState {
  month: number;
  turn: number; // 1..turnsPerMonth within the month
  turnsPerMonth: number;
  hand: ActionCard[]; // the current turn's offered cards
  members: Member[];
  leaderPart: string; // the player's chosen part
  support: Support;
  songs: Song[];
  practiceFreshness: number; // 0–100, decays monthly; low = worse live
  funds: number;
  totalFans: number;
  segFans: Record<Segment, number>;
  fame: number; // 0–100
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

/** Background scene keys (mapped to images in the asset manifest). */
export type BgKey = "studio" | "street" | "venueSmall" | "venueBig" | "backstage";

/** A character placed in a scene. */
export interface SceneChar {
  member: string; // member name -> standing art
  pos: "left" | "center" | "right";
  mood?: "normal" | "fired" | "happy" | "sad";
}

/** One panel of a VN-style story scene (event narration). */
export interface Scene {
  bg: BgKey;
  chars: SceneChar[];
  text: string;
  speaker?: string; // name shown on the textbox tag (dialogue)
  fx?: "shake" | "flash"; // optional punch-up effect
}

/** Practice outcome = stat changes (for the board floats) + a scene sequence. */
export interface PracticeResult {
  outcome: EventOutcome;
  scenes: Scene[];
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
