// DOM rendering for the prototype. The board is the focus; member stats and
// the segment-appeal profile live behind buttons (overlays). During a turn,
// anim.ts animates directly on this DOM, then render() re-syncs.

import { appealProfile } from "../game/coreLoop";
import { TRAININGS } from "../game/narrative";
import type { GameState, LiveDecision, LiveResult, Member, Param, Scene, Space } from "../game/types";
import { PARAM_LABEL, PARAMS, SEGMENT_LABEL, SEGMENTS } from "../game/types";
import { bgSrc, charSrc } from "./assets";

export interface UiState {
  mode: "board" | "practiceChoice" | "slides" | "live" | "result";
  panel: "none" | "members" | "appeal";
  rolling: boolean;
  lastRoll: number;
  pendingMult: number; // dice multiplier awaiting a practice choice
  sceneSeq: Scene[];
  sceneIndex: number;
  liveDecision: LiveDecision;
  liveResult?: LiveResult;
}

export interface Handlers {
  onRoll: () => void;
  onOpenPanel: (panel: UiState["panel"]) => void;
  onClosePanel: () => void;
  onChooseTraining: (param: Param) => void;
  onSlideNext: () => void;
  onLiveChange: (patch: Partial<LiveDecision>) => void;
  onConfirmLive: () => void;
  onNextMonth: () => void;
}

const PART_COLOR: Record<string, string> = {
  Vo: "#ff5577",
  Gt: "#ffcf3a",
  Ba: "#3aa0ff",
  Dr: "#2fbf71",
  Key: "#a06bff",
};

const SPACE_ICON: Record<Space["kind"], string> = {
  practice: "🎸",
  rest: "💤",
  money: "💴",
  fan: "🔥",
  event: "❗",
  live: "🎤",
};

function grade(v: number): string {
  if (v >= 90) return "S";
  if (v >= 80) return "A";
  if (v >= 70) return "B";
  if (v >= 60) return "C";
  if (v >= 50) return "D";
  if (v >= 40) return "E";
  if (v >= 30) return "F";
  return "G";
}

const esc = (s: string) =>
  s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);

function gaugeRow(label: string, value: number, cls = ""): string {
  return `
    <div class="gauge ${cls}">
      <span class="lbl">${label}</span>
      <span class="grade">${grade(value)}</span>
      <span class="bar"><span style="width:${Math.min(100, value)}%"></span></span>
    </div>`;
}

function topbar(state: GameState): string {
  return `
    <div class="topbar">
      <div class="logo">Metal Road<small>~ SUCCESS! ~</small></div>
      <div class="stats">
        <div class="stat"><div class="v">${state.month}</div><div class="k">ヶ月目</div></div>
        <div class="stat"><div class="v">${state.totalFans.toLocaleString()}</div><div class="k">ファン</div></div>
        <div class="stat"><div class="v">${state.fame}</div><div class="k">知名度</div></div>
        <div class="stat"><div class="v">¥${state.funds.toLocaleString()}</div><div class="k">資金</div></div>
      </div>
    </div>`;
}

function spaceView(sp: Space, i: number, pos: number): string {
  const hidden = !sp.fixed && !sp.revealed;
  const here = i === pos ? "here" : "";
  const pin = i === pos ? `<span class="pin">📍</span>` : "";
  if (hidden) {
    return `<div class="space hidden ${here}">${pin}<span class="ico">？</span></div>`;
  }
  return `<div class="space ${sp.kind} ${here}">
    ${pin}<span class="ico">${SPACE_ICON[sp.kind]}</span><span>${esc(sp.label)}</span>
  </div>`;
}

function boardView(state: GameState): string {
  const spaces = state.board.map((sp, i) => spaceView(sp, i, state.pos)).join("");
  return `<div class="board">${spaces}</div>`;
}

function diceBar(ui: UiState, atLive: boolean): string {
  const disabled = ui.rolling || atLive || ui.mode !== "board";
  return `
    <div class="dicebar">
      <div class="dice">${ui.lastRoll || "🎲"}</div>
      <button class="btn roll" id="roll" ${disabled ? "disabled" : ""}>
        ${ui.rolling ? "進行中…" : "サイコロを振る"}
      </button>
      <div class="navbtns">
        <button class="iconbtn" id="open-members">🎸 メンバー</button>
        <button class="iconbtn" id="open-appeal">📊 アピール</button>
      </div>
    </div>`;
}

function memberCard(m: Member): string {
  const color = PART_COLOR[m.part] ?? "#888";
  return `
    <div class="member">
      <div class="avatar">
        <div class="head"></div>
        <div class="body" style="background:${color}"></div>
        <div class="part">${esc(m.part)}</div>
      </div>
      <div class="minfo">
        <div class="mname">${esc(m.name)}</div>
        <div class="gauges">
          ${PARAMS.map((p) => gaugeRow(PARAM_LABEL[p], m[p])).join("")}
          ${gaugeRow("体力", m.stamina, "stamina")}
        </div>
      </div>
    </div>`;
}

function membersPanel(state: GameState): string {
  return `
    <div class="overlay"><div class="panel modal">
      <h2>🎸 メンバー</h2>
      ${state.members.map(memberCard).join("")}
      <div class="center"><button class="btn secondary" id="close-panel">閉じる</button></div>
    </div></div>`;
}

function appealPanel(state: GameState): string {
  const prof = appealProfile(state);
  const rows = SEGMENTS.map(
    (s) =>
      `<div class="gauge"><span class="lbl">${SEGMENT_LABEL[s]}</span>
        <span class="grade">${grade(prof[s])}</span>
        <span class="bar"><span style="width:${prof[s]}%"></span></span></div>`,
  ).join("");
  return `
    <div class="overlay"><div class="panel modal">
      <h2>📊 セグメント別アピール</h2>
      <div class="hint">バンドの強みがどのファン層に刺さるか（ライブのターゲット選びの参考に）</div>
      ${rows}
      <div class="center"><button class="btn secondary" id="close-panel">閉じる</button></div>
    </div></div>`;
}

const TRAIN_ICON: Record<Param, string> = { T: "🥁", P: "🎤", S: "🎼", V: "🖤" };

function practiceChoiceModal(ui: UiState): string {
  const opts = PARAMS.map((p) => {
    const t = TRAININGS[p];
    const gain = 2 * ui.pendingMult;
    return `<button class="train" data-train="${p}">
        <span class="tart">${TRAIN_ICON[p]}</span>
        <span class="tname">${PARAM_LABEL[p]}</span>
        <span class="tdesc">${esc(t.name)} ／ +${gain}</span>
      </button>`;
  }).join("");
  return `
    <div class="overlay"><div class="panel modal">
      <h2>🎸 練習メニューを選択（出目 ×${ui.pendingMult}）</h2>
      <div class="hint">どの能力を伸ばす？ 出目が大きいほど効果も大きい。</div>
      <div class="traingrid">${opts}</div>
    </div></div>`;
}

function sceneModal(ui: UiState): string {
  const s = ui.sceneSeq[ui.sceneIndex];
  const last = ui.sceneIndex === ui.sceneSeq.length - 1;
  const dots = ui.sceneSeq
    .map((_, i) => `<span class="dot ${i === ui.sceneIndex ? "on" : ""}"></span>`)
    .join("");
  const chars = s.chars
    .map(
      (c) =>
        `<img class="sc-char ${c.pos} mood-${c.mood ?? "normal"}" src="${charSrc(c.member)}" alt="${esc(c.member)}" />`,
    )
    .join("");
  const speaker = s.speaker ? `<div class="sc-speaker">${esc(s.speaker)}</div>` : "";
  const fx = s.fx === "flash" ? `<div class="sc-flash"></div>` : "";
  return `
    <div class="overlay scene-overlay">
      <div class="scene ${s.fx === "shake" ? "shake" : ""}" style="background-image:url('${bgSrc(s.bg)}')">
        <div class="sc-stage">${chars}</div>
        ${fx}
        <div class="sc-textbox">
          ${speaker}
          <div class="sc-text">${esc(s.text)}</div>
          <div class="sc-foot">
            <div class="dots">${dots}</div>
            <button class="btn" id="scene-next">${last ? "完了" : "次へ ▶"}</button>
          </div>
        </div>
      </div>
    </div>`;
}

function liveModal(state: GameState, ui: UiState): string {
  const d = ui.liveDecision;
  const caps = [300, 600, 1200];
  const capOpts = caps
    .map((c) => `<button class="opt ${d.cap === c ? "sel" : ""}" data-cap="${c}">${c}人</button>`)
    .join("");
  const segOpts = SEGMENTS.map(
    (s) => `<button class="opt ${d.target === s ? "sel" : ""}" data-target="${s}">${SEGMENT_LABEL[s]}</button>`,
  ).join("");
  const songOpts = state.songs
    .map(
      (sg, i) =>
        `<button class="opt ${d.songIndex === i ? "sel" : ""}" data-song="${i}">${esc(sg.name)} (Q${sg.Q})</button>`,
    )
    .join("");
  return `
    <div class="overlay"><div class="panel modal">
      <h2>🎤 月末ライブ — 意思決定</h2>
      <div class="field"><label>会場キャパ（背伸び ⇄ 手堅さ）</label><div class="opts">${capOpts}</div>
        <div class="hint">大きいほど新規リーチ大／空席・会場費のリスク大</div></div>
      <div class="field"><label>ターゲットとするファン層</label><div class="opts">${segOpts}</div></div>
      <div class="field"><label>セットリスト（楽曲）</label><div class="opts">${songOpts}</div></div>
      <div class="center"><button class="btn" id="confirm-live">この方針でライブ実施！</button></div>
    </div></div>`;
}

function resultModal(state: GameState, ui: UiState): string {
  const r = ui.liveResult!;
  const money = r.profit >= 0 ? "pos" : "neg";
  const sign = r.profit >= 0 ? "+" : "−";
  return `
    <div class="overlay"><div class="panel modal">
      <h2>ライブ結果 — ${state.month}ヶ月目</h2>
      <div class="kpis">
        <div class="kpi"><div class="v">${r.draw.toLocaleString()}/${r.capacity}</div><div class="k">動員数 ${r.soldOut ? "🎉SOLD OUT" : `(${Math.round(r.occupancy * 100)}%)`}</div></div>
        <div class="kpi"><div class="v">${r.satisfaction}</div><div class="k">観客満足度</div></div>
        <div class="kpi"><div class="v">+${r.newFans.toLocaleString()}</div><div class="k">新規ファン</div></div>
        <div class="kpi"><div class="v">${r.streams.toLocaleString()}</div><div class="k">ストリーミング再生</div></div>
      </div>
      <div class="kpi">
        <div class="v money ${money}">${sign}¥${Math.abs(Math.round(r.profit)).toLocaleString()}</div>
        <div class="k">収支（売上¥${Math.round(r.revenue).toLocaleString()} − 経費¥${Math.round(r.cost).toLocaleString()}）</div>
      </div>
      <div class="center"><button class="btn secondary" id="next-month">次の月へ →</button></div>
    </div></div>`;
}

export function render(root: HTMLElement, state: GameState, ui: UiState, h: Handlers): void {
  const atLive = state.pos >= 0 && state.board[state.pos]?.kind === "live";
  root.innerHTML = `
    ${topbar(state)}
    <div class="stage">
      <div class="panel boardpanel">
        <h2>進行ボード（${state.month}ヶ月目）</h2>
        ${boardView(state)}
        ${diceBar(ui, atLive)}
      </div>
      <div class="panel logpanel">
        <h2>ログ</h2>
        <div class="log">${state.log.map((l) => `<div>${esc(l)}</div>`).join("")}</div>
      </div>
    </div>
    ${ui.panel === "members" ? membersPanel(state) : ""}
    ${ui.panel === "appeal" ? appealPanel(state) : ""}
    ${ui.mode === "practiceChoice" ? practiceChoiceModal(ui) : ""}
    ${ui.mode === "slides" ? sceneModal(ui) : ""}
    ${ui.mode === "live" ? liveModal(state, ui) : ""}
    ${ui.mode === "result" ? resultModal(state, ui) : ""}
  `;

  root.querySelector("#roll")?.addEventListener("click", () => h.onRoll());
  root.querySelector("#open-members")?.addEventListener("click", () => h.onOpenPanel("members"));
  root.querySelector("#open-appeal")?.addEventListener("click", () => h.onOpenPanel("appeal"));
  root.querySelector("#close-panel")?.addEventListener("click", () => h.onClosePanel());
  root.querySelectorAll<HTMLButtonElement>("[data-train]").forEach((el) =>
    el.addEventListener("click", () => h.onChooseTraining(el.dataset.train as Param)),
  );
  root.querySelector("#scene-next")?.addEventListener("click", () => h.onSlideNext());
  root.querySelectorAll<HTMLButtonElement>("[data-cap]").forEach((el) =>
    el.addEventListener("click", () => h.onLiveChange({ cap: Number(el.dataset.cap) })),
  );
  root.querySelectorAll<HTMLButtonElement>("[data-target]").forEach((el) =>
    el.addEventListener("click", () => h.onLiveChange({ target: el.dataset.target as LiveDecision["target"] })),
  );
  root.querySelectorAll<HTMLButtonElement>("[data-song]").forEach((el) =>
    el.addEventListener("click", () => h.onLiveChange({ songIndex: Number(el.dataset.song) })),
  );
  root.querySelector("#confirm-live")?.addEventListener("click", () => h.onConfirmLive());
  root.querySelector("#next-month")?.addEventListener("click", () => h.onNextMonth());
}
