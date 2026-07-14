// Minimal BGM manager: one looping <audio>, one track at a time, lazy-loaded.
// Browsers block autoplay until a user gesture, so playback actually starts on
// the first click (see resume()). Mute is persisted in localStorage.

const base = import.meta.env.BASE_URL;

export type TrackKey =
  | "metalroad"
  | "rolling"
  | "cosmos"
  | "metropolis"
  | "crimson"
  | "freedom";

const SRC: Record<TrackKey, string> = {
  metalroad: `${base}assets/bgm/metal-road.mp3`,
  rolling: `${base}assets/bgm/rolling-dice.mp3`,
  cosmos: `${base}assets/bgm/isolated-cosmos.mp3`,
  metropolis: `${base}assets/bgm/metropolis.mp3`,
  crimson: `${base}assets/bgm/crimson-horizon.mp3`,
  freedom: `${base}assets/bgm/freedom.mp3`,
};

const VOLUME = 0.5;
let el: HTMLAudioElement | null = null;
let current: TrackKey | null = null;
let muted = typeof localStorage !== "undefined" && localStorage.getItem("mr_muted") === "1";

function ensure(): HTMLAudioElement {
  if (!el) {
    el = new Audio();
    el.loop = true;
    el.preload = "none";
    el.volume = muted ? 0 : VOLUME;
  }
  return el;
}

/** Switch to a track (no-op if already playing it). Safe to call every render. */
export function play(key: TrackKey): void {
  const a = ensure();
  if (key !== current) {
    current = key;
    a.src = SRC[key];
  }
  a.volume = muted ? 0 : VOLUME;
  if (!muted) void a.play().catch(() => {});
}

/** Resume the current track after a user gesture (called on first interaction). */
export function resume(): void {
  if (el && current && !muted && el.paused) void el.play().catch(() => {});
}

export function isMuted(): boolean {
  return muted;
}

/** Toggle mute; returns the new muted state. */
export function toggleMute(): boolean {
  muted = !muted;
  try {
    localStorage.setItem("mr_muted", muted ? "1" : "0");
  } catch {
    /* ignore storage errors */
  }
  if (el) {
    el.volume = muted ? 0 : VOLUME;
    if (muted) el.pause();
    else if (current) void el.play().catch(() => {});
  }
  return muted;
}
