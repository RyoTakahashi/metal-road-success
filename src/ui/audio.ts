// BGM manager with a smooth crossfade between tracks (no hard cuts on scene
// changes). Two <audio> elements ping-pong: the incoming one fades in while the
// outgoing one fades out. Browsers block autoplay until a user gesture, so
// playback actually starts on the first click (see resume()). Mute persists.

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
const FADE_MS = 900; // crossfade duration
const STEP_MS = 40;

let els: HTMLAudioElement[] = [];
let idx = 0; // which element currently holds the active track
let current: TrackKey | null = null;
let fadeTimer: ReturnType<typeof setInterval> | null = null;
let muted = typeof localStorage !== "undefined" && localStorage.getItem("mr_muted") === "1";

function ensure(): void {
  if (els.length) return;
  for (let i = 0; i < 2; i++) {
    const a = new Audio();
    a.loop = true;
    a.preload = "none";
    a.volume = 0;
    els.push(a);
  }
}

const active = (): HTMLAudioElement => els[idx];

/** Crossfade the active element to `to` volume and the incoming to `VOLUME`. */
function crossfade(incoming: HTMLAudioElement, outgoing: HTMLAudioElement | null): void {
  if (fadeTimer) clearInterval(fadeTimer);
  const target = muted ? 0 : VOLUME;
  const steps = Math.max(1, Math.round(FADE_MS / STEP_MS));
  let n = 0;
  fadeTimer = setInterval(() => {
    n += 1;
    const t = Math.min(1, n / steps);
    incoming.volume = target * t;
    if (outgoing) outgoing.volume = target * (1 - t);
    if (t >= 1) {
      if (fadeTimer) clearInterval(fadeTimer);
      fadeTimer = null;
      if (outgoing) outgoing.pause();
    }
  }, STEP_MS);
}

/** Switch to a track with a crossfade (no-op if it's already active). */
export function play(key: TrackKey): void {
  ensure();
  if (key === current) {
    // already the active track — just make sure it's audible/playing.
    const a = active();
    a.volume = muted ? 0 : VOLUME;
    if (!muted && a.paused) void a.play().catch(() => {});
    return;
  }
  const outgoing = current ? active() : null;
  idx ^= 1;
  const incoming = active();
  incoming.src = SRC[key];
  incoming.volume = 0;
  current = key;
  if (!muted) {
    void incoming.play().catch(() => {});
    crossfade(incoming, outgoing);
  }
}

/** Resume the active track after a user gesture (called on first interaction). */
export function resume(): void {
  const a = els[idx];
  if (a && current && !muted && a.paused) {
    void a.play().catch(() => {});
    if (a.volume === 0) crossfade(a, null);
  }
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
  const a = els[idx];
  if (a) {
    if (muted) {
      if (fadeTimer) clearInterval(fadeTimer), (fadeTimer = null);
      a.volume = 0;
      a.pause();
    } else if (current) {
      void a.play().catch(() => {});
      crossfade(a, null);
    }
  }
  return muted;
}
