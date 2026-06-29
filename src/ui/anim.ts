// Imperative DOM animations for a turn: dice roll, pin hop, space reveal,
// and floating stat-change deltas. Operates on the board DOM built by render().

import type { EventOutcome, Space } from "../game/types";

const SPACE_ICON: Record<Space["kind"], string> = {
  practice: "🎸",
  rest: "💤",
  money: "💴",
  fan: "🔥",
  event: "❗",
  live: "🎤",
};

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const spaces = (root: HTMLElement) =>
  Array.from(root.querySelectorAll<HTMLElement>(".space"));

/** Spin the dice face, then settle on the rolled value. */
export async function animateDice(diceEl: HTMLElement, value: number): Promise<void> {
  diceEl.classList.add("rolling");
  for (let i = 0; i < 12; i++) {
    diceEl.textContent = String(1 + Math.floor(Math.random() * 6));
    await sleep(55);
  }
  diceEl.textContent = String(value);
  diceEl.classList.remove("rolling");
  diceEl.classList.add("settle");
  await sleep(280);
  diceEl.classList.remove("settle");
}

/** Hop the position marker from `from` to `to`, one space at a time. */
export async function animatePin(root: HTMLElement, from: number, to: number): Promise<void> {
  const els = spaces(root);
  els.forEach((s) => s.classList.remove("here"));
  const start = from < 0 ? 0 : from + 1;
  for (let i = start; i <= to; i++) {
    els.forEach((s) => s.classList.remove("here"));
    const el = els[i];
    if (!el) continue;
    el.classList.add("here", "hop");
    await sleep(170);
    el.classList.remove("hop");
  }
  els[to]?.classList.add("here");
}

/** Flip a hidden "?" space open to reveal its true kind. */
export async function animateReveal(root: HTMLElement, index: number, space: Space): Promise<void> {
  const el = spaces(root)[index];
  if (!el) return;
  el.classList.add("flip");
  await sleep(160);
  el.classList.remove("hidden");
  el.classList.add(space.kind);
  el.innerHTML =
    `<span class="pin">📍</span><span class="ico">${SPACE_ICON[space.kind]}</span>` +
    `<span>${space.label}</span>`;
  await sleep(220);
  el.classList.remove("flip");
}

/** Show the event banner and float each stat delta up off the space. */
export async function animateOutcome(root: HTMLElement, index: number, outcome: EventOutcome): Promise<void> {
  const board = root.querySelector<HTMLElement>(".board");
  const el = spaces(root)[index];
  if (!board || !el) return;

  // banner
  const banner = document.createElement("div");
  banner.className = "event-banner";
  banner.innerHTML = `<span class="bi">${outcome.icon}</span><span>${outcome.title}</span>`;
  board.appendChild(banner);

  // floating deltas anchored to the landed space
  const cx = el.offsetLeft + el.offsetWidth / 2;
  const cy = el.offsetTop;
  outcome.deltas.forEach((d, i) => {
    const f = document.createElement("div");
    f.className = `float ${d.dir}`;
    f.textContent = `${d.label} ${d.value}`;
    f.style.left = `${cx}px`;
    f.style.top = `${cy}px`;
    f.style.animationDelay = `${i * 140}ms`;
    board.appendChild(f);
    setTimeout(() => f.remove(), 1400 + i * 140);
  });

  if (outcome.deltas.length > 0) el.classList.add("pulse");
  await sleep(1000);
  el.classList.remove("pulse");
  setTimeout(() => banner.remove(), 200);
}
