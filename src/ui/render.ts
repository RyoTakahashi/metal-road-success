// DOM rendering. The board is now a per-turn hand of action cards; member
// stats and the appeal profile live behind buttons (overlays). Scenes and the
// live result are VN-style overlays.

import { appealProfile, K } from "../game/coreLoop";
import { TRAININGS } from "../game/narrative";
import {
  FATIGUE_FLOOR,
  PARTS,
  STAFF_CAP,
  STAFF_DEFS,
  bandStamina,
  canRecruit,
  isCardLocked,
  nameOf,
  recruitableRoles,
  staminaTag,
} from "../game/state";
import type {
  ActionKind,
  GameState,
  LiveDecision,
  LiveResult,
  Member,
  Param,
  Scene,
  StaffRole,
} from "../game/types";
import { ACTION_ICON, ACTION_LABEL, PARAM_LABEL, PARAMS, SEGMENT_LABEL, SEGMENTS, STAFF_LABEL } from "../game/types";
import { bgSrc, charSrc } from "./assets";

export interface UiState {
  mode: "title" | "partSelect" | "board" | "cardSub" | "staffPick" | "practiceChoice" | "slides" | "live" | "result";
  panel: "none" | "members" | "appeal";
  pendingCard?: ActionKind; // card whose sub-option is being chosen
  sceneSeq: Scene[];
  sceneIndex: number;
  liveDecision: LiveDecision;
  liveResult?: LiveResult;
  auto: boolean;
}

export interface Handlers {
  onStart: () => void;
  onChoosePart: (part: string, name: string) => void;
  onPlayCard: (kind: ActionKind) => void;
  onChooseSub: (subId: string) => void;
  onRecruit: (role: StaffRole) => void;
  onChooseTraining: (param: Param) => void;
  onSlideNext: () => void;
  onOpenPanel: (panel: UiState["panel"]) => void;
  onClosePanel: () => void;
  onLiveChange: (patch: Partial<LiveDecision>) => void;
  onConfirmLive: () => void;
  onNextMonth: () => void;
  onToggleAuto: () => void;
}

const PART_COLOR: Record<string, string> = {
  Vo: "#ff5577",
  Gt: "#ffcf3a",
  Ba: "#3aa0ff",
  Dr: "#2fbf71",
  Key: "#a06bff",
};

const ROSTER = ["RYO", "KEN", "MIO", "GO"];

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
      <span class="rankchip rank-${state.rank}">${state.rank === "major" ? "MAJOR" : "INDIE"}</span>
      <div class="stats">
        <div class="stat"><div class="v">${state.month}<span class="turn">·${state.turn}/${state.turnsPerMonth}</span></div><div class="k">月・ターン</div></div>
        <div class="stat"><div class="v">${state.totalFans.toLocaleString()}</div><div class="k">ファン</div></div>
        <div class="stat"><div class="v">${state.fame}</div><div class="k">知名度</div></div>
        <div class="stat"><div class="v">¥${state.funds.toLocaleString()}</div><div class="k">資金</div></div>
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
        <div class="mname">${esc(m.name)}${m.isLeader ? ' <span class="leadtag">YOU</span>' : ""}</div>
        <div class="gauges">
          ${PARAMS.map((p) => gaugeRow(PARAM_LABEL[p], m[p])).join("")}
          ${gaugeRow("体力", m.stamina, "stamina")}
        </div>
      </div>
    </div>`;
}

function staffRow(role: StaffRole, intimacy: number, cut: number): string {
  return `
    <div class="member staffrow">
      <div class="avatar"><div class="head"></div><div class="body" style="background:#5b6b86"></div><div class="part">🎧</div></div>
      <div class="minfo">
        <div class="mname">${STAFF_LABEL[role]} <span class="leadtag cut">人件費${Math.round(cut * 100)}%</span></div>
        <div class="gauges">${gaugeRow("親密度", intimacy)}</div>
      </div>
    </div>`;
}

function membersPanel(state: GameState): string {
  const staff = state.staff.length
    ? `<h2 class="sub">🎧 サポート陣</h2>${state.staff.map((s) => staffRow(s.role, s.intimacy, s.cut)).join("")}`
    : "";
  return `
    <div class="overlay"><div class="panel modal">
      <h2>🎸 メンバー</h2>
      ${state.members.map(memberCard).join("")}
      ${staff}
      <div class="center"><button class="btn secondary" id="close-panel">閉じる</button></div>
    </div></div>`;
}

function staffPickModal(state: GameState): string {
  const opts = recruitableRoles(state)
    .map((r) => {
      const d = STAFF_DEFS[r];
      return `<button class="train" data-recruit="${r}">
        <span class="tname">${STAFF_LABEL[r]} <small>(人脈-${d.contactCost})</small></span>
        <span class="tdesc">${esc(d.desc)}／人件費${Math.round(d.cut * 100)}%</span>
      </button>`;
    })
    .join("");
  return `
    <div class="overlay"><div class="panel modal">
      <h2>🤝 サポート勧誘（人脈 ${state.contacts} / 枠 ${state.staff.length}/${STAFF_CAP}）</h2>
      <div class="hint">加入で活動が拡大。ただしライブ収益から人件費、親密度の管理も必要。</div>
      <div class="traingrid">${opts}</div>
      <div class="center"><button class="btn secondary" id="close-panel">やめる</button></div>
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

// --- Hand of action cards (the main board) ---------------------------------

const CARD_HINT: Record<ActionKind, string> = {
  rest: "完全休養／社会勉強／趣味",
  music: "作曲／練習／パフォーマンス",
  promo: "宣伝で知名度・ファン↑",
  network: "バンド／新たな人脈",
  money: "バイトで資金を稼ぐ",
};

function handView(state: GameState): string {
  const cards = state.hand
    .map((c) => {
      const locked = isCardLocked(state, c.kind);
      return `
      <button class="actcard ${c.kind} ${locked ? "locked" : ""}" data-card="${c.kind}" ${locked ? "disabled" : ""}>
        <span class="ac-ico">${ACTION_ICON[c.kind]}</span>
        <span class="ac-name">${ACTION_LABEL[c.kind]}</span>
        <span class="ac-hint">${locked ? "疲労で行動不可" : CARD_HINT[c.kind]}</span>
        <span class="ac-sta">${staminaTag(c.kind)}</span>
      </button>`;
    })
    .join("");
  const freshTone = state.practiceFreshness >= 60 ? "" : state.practiceFreshness >= 30 ? "warn" : "bad";
  const newest = state.songs.reduce((a, s) => Math.min(a, s.age), 99);
  const songTone = newest <= 1 ? "" : newest <= 3 ? "warn" : "bad";
  const sta = Math.round(bandStamina(state));
  const staTone = sta < FATIGUE_FLOOR ? "bad" : sta < 50 ? "warn" : "";
  const fatigued = sta < FATIGUE_FLOOR;
  return `
    <div class="panel boardpanel">
      <h2>${state.month}ヶ月目 ・ ターン ${state.turn}/${state.turnsPerMonth} — 行動を選択</h2>
      <div class="handbar">
        <span class="meter ${staTone}">体力(平均) ${sta}</span>
        <span class="meter ${freshTone}">練習の鮮度 ${Math.round(state.practiceFreshness)}</span>
        <span class="meter ${songTone}">最新曲 ${newest === 0 ? "NEW" : `${newest}ヶ月前`}</span>
        <span class="meter">🤝 人脈 ${state.contacts}</span>
        <span class="meter">🔥 結束 ${Math.round(state.bond)}</span>
        ${state.staff.length ? `<span class="meter">🎧 サポート ${state.staff.length}/${STAFF_CAP}</span>` : ""}
      </div>
      ${fatigued ? '<div class="fatigue-note">メンバーは疲労困憊…「休息」でしか動けない。しっかり休もう。</div>' : ""}
      <div class="hand">${cards}</div>
      <div class="dicebar">
        <div class="navbtns">
          <button class="iconbtn auto" id="toggle-auto">▶ オート</button>
          <button class="iconbtn" id="open-members">🎸 メンバー</button>
          <button class="iconbtn" id="open-appeal">📊 アピール</button>
        </div>
      </div>
    </div>`;
}

function cardSubModal(state: GameState, ui: UiState): string {
  const kind = ui.pendingCard!;
  const card = state.hand.find((c) => c.kind === kind);
  const subs = card?.subs ?? [];
  const opts = subs
    .map(
      (s) => `<button class="train" data-sub="${s.id}">
        <span class="tname">${s.label}</span>
        <span class="tdesc">${esc(s.desc)}</span>
      </button>`,
    )
    .join("");
  const recruit =
    kind === "network" && canRecruit(state)
      ? `<button class="train recruit" data-sub="recruit">
        <span class="tname">🤝 サポート勧誘</span>
        <span class="tdesc">人脈を使ってサポート陣を招く（人脈 ${state.contacts}）</span>
      </button>`
      : "";
  return `
    <div class="overlay"><div class="panel modal">
      <h2>${ACTION_ICON[kind]} ${ACTION_LABEL[kind]} — 内容を選択</h2>
      <div class="traingrid">${opts}${recruit}</div>
      <div class="center"><button class="btn secondary" id="close-panel">やめる</button></div>
    </div></div>`;
}

const TRAIN_ICON: Record<Param, string> = { T: "🥁", P: "🎤", S: "🎼", V: "🖤" };

function practiceChoiceModal(): string {
  const opts = PARAMS.map((p) => {
    const t = TRAININGS[p];
    return `<button class="train" data-train="${p}">
        <span class="tart">${TRAIN_ICON[p]}</span>
        <span class="tname">${PARAM_LABEL[p]}</span>
        <span class="tdesc">${esc(t.name)} ／ +6</span>
      </button>`;
  }).join("");
  return `
    <div class="overlay"><div class="panel modal">
      <h2>🎸 練習メニューを選択</h2>
      <div class="hint">どの能力を伸ばす？ 全員に効果。</div>
      <div class="traingrid">${opts}</div>
      <div class="center"><button class="btn secondary" id="close-panel">やめる</button></div>
    </div></div>`;
}

function sceneModal(state: GameState, ui: UiState): string {
  const s = ui.sceneSeq[ui.sceneIndex];
  const last = ui.sceneIndex === ui.sceneSeq.length - 1;
  const dots = ui.sceneSeq
    .map((_, i) => `<span class="dot ${i === ui.sceneIndex ? "on" : ""}"></span>`)
    .join("");
  const chars = s.chars
    .map(
      (c) =>
        `<img class="sc-char ${c.pos} mood-${c.mood ?? "normal"}" src="${charSrc(c.member, c.mood ?? "normal")}" alt="${esc(nameOf(state, c.member))}" />`,
    )
    .join("");
  const speaker = s.speaker ? `<div class="sc-speaker">${esc(nameOf(state, s.speaker))}</div>` : "";
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

const venueName = (cap: number): string => (cap <= 200 ? "小箱ライブハウス" : cap <= 600 ? "ライブホール" : "大ホール");

function liveModal(state: GameState, ui: UiState): string {
  const d = ui.liveDecision;
  const caps = state.rank === "major" ? [500, 1200, 2500] : [150, 500, 1200];
  const capOpts = caps
    .map((c) => {
      const cost = c * K.venueCostPerSeat;
      const locked = state.funds < cost;
      return `<button class="opt ${d.cap === c ? "sel" : ""} ${locked ? "locked" : ""}" data-cap="${c}" ${locked ? "disabled" : ""}>
        ${venueName(c)}<span class="capn">${c}人 / 会場費¥${cost.toLocaleString()}</span></button>`;
    })
    .join("");
  const segOpts = SEGMENTS.map(
    (s) => `<button class="opt ${d.target === s ? "sel" : ""}" data-target="${s}">${SEGMENT_LABEL[s]}</button>`,
  ).join("");
  const songOpts = state.songs
    .map(
      (sg, i) =>
        `<button class="opt ${d.songIndex === i ? "sel" : ""}" data-song="${i}">${esc(sg.name)} (Q${sg.Q}${sg.age === 0 ? " NEW" : `/${sg.age}ヶ月`})</button>`,
    )
    .join("");
  const cost = d.cap * K.venueCostPerSeat;
  const canPay = state.funds >= cost;
  return `
    <div class="overlay"><div class="panel modal">
      <h2>🎤 月末ライブ — 意思決定</h2>
      <div class="field"><label>会場キャパ（会場費を前払い）</label><div class="opts">${capOpts}</div>
        <div class="hint">資金が足りない規模は選べない。序盤はバイトで会場費を稼ごう。</div></div>
      <div class="field"><label>ターゲットとするファン層</label><div class="opts">${segOpts}</div></div>
      <div class="field"><label>セットリスト（楽曲）</label><div class="opts">${songOpts}</div></div>
      <div class="center"><button class="btn" id="confirm-live" ${canPay ? "" : "disabled"}>${canPay ? "この方針でライブ実施！" : "資金不足（会場費が払えない）"}</button></div>
    </div></div>`;
}

function liveVerdict(sat: number): { rank: string; tone: string; line: string } {
  if (sat >= 80) return { rank: "S", tone: "great", line: "伝説のライブ！会場が一つになった！" };
  if (sat >= 70) return { rank: "A", tone: "great", line: "最高のステージ！確かな手応え！" };
  if (sat >= 60) return { rank: "B", tone: "good", line: "良いライブだった。爪痕を残した。" };
  if (sat >= 50) return { rank: "C", tone: "good", line: "悪くない。次につながる出来。" };
  if (sat >= 40) return { rank: "D", tone: "poor", line: "盛り上がりは今ひとつ…。" };
  return { rank: "E", tone: "poor", line: "課題の残るライブになった…。" };
}

function countUp(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>("[data-count]").forEach((el) => {
    const target = Number(el.dataset.count) || 0;
    const prefix = el.dataset.prefix ?? "";
    const dur = 650;
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / dur);
      const eased = 1 - (1 - p) * (1 - p);
      el.textContent = prefix + Math.round(target * eased).toLocaleString();
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

function resultModal(state: GameState, ui: UiState): string {
  const r = ui.liveResult!;
  const money = r.profit >= 0 ? "pos" : "neg";
  const sign = r.profit >= 0 ? "+" : "−";
  const v = liveVerdict(r.satisfaction);
  const bg = ui.liveDecision.cap >= 1000 ? "venueBig" : "venueSmall";
  return `
    <div class="overlay result-overlay" style="background-image:url('${bgSrc(bg)}')">
      <div class="result-scrim"></div>
      ${r.satisfaction >= 70 ? '<div class="sc-flash"></div>' : ""}
      <div class="panel modal resultcard tone-${v.tone}">
        <div class="result-head">
          <div class="rank rank-${v.tone}">${v.rank}</div>
          <div class="result-title"><h2>ライブ結果 — ${state.month}ヶ月目</h2><div class="verdict">${v.line}</div>${r.trouble ? '<div class="trouble">⚠ 当日トラブル発生（PA親密度不足）</div>' : ""}</div>
          ${r.soldOut ? '<div class="soldout">SOLD<br>OUT</div>' : ""}
        </div>
        <div class="kpis">
          <div class="kpi"><div class="v" data-count="${r.draw}">0</div><div class="sub">/${r.capacity.toLocaleString()}</div><div class="k">動員数 ${r.soldOut ? "🎉" : `${Math.round(r.occupancy * 100)}%`}</div></div>
          <div class="kpi"><div class="v" data-count="${r.satisfaction}">0</div><div class="k">観客満足度</div></div>
          <div class="kpi"><div class="v pos" data-count="${r.newFans}" data-prefix="+">0</div><div class="k">新規ファン</div></div>
          <div class="kpi"><div class="v" data-count="${r.streams}">0</div><div class="k">ストリーミング再生</div></div>
        </div>
        <div class="kpi money-row">
          <div class="v money ${money}">${sign}¥${Math.abs(Math.round(r.profit)).toLocaleString()}</div>
          <div class="k">収支（売上¥${Math.round(r.revenue).toLocaleString()} − 経費¥${Math.round(r.cost).toLocaleString()}${r.staffCost > 0 ? `／うち人件費¥${r.staffCost.toLocaleString()}` : ""}）</div>
        </div>
        <div class="center"><button class="btn" id="next-month">次の月へ →</button></div>
      </div>
    </div>`;
}

function homeHero(state: GameState): string {
  const byArt = new Map(state.members.map((m) => [m.artKey, m]));
  const avg = state.members.reduce((s, m) => s + m.stamina, 0) / (state.members.length || 1);
  const chars = ROSTER.filter((a) => byArt.has(a))
    .map((a, i) => {
      const m = byArt.get(a)!;
      const tired = m.stamina <= 35;
      return `<img class="hero-char ${tired ? "tired" : ""}" style="--i:${i}" src="${charSrc(a, tired ? "sad" : "normal")}" alt="${esc(m.name)}" />`;
    })
    .join("");
  const caption = avg <= 40 ? "🎸 練習スタジオ — 少しお疲れ気味…" : "🎸 練習スタジオ — バンドの日常";
  return `
    <div class="home-hero" style="background-image:url('${bgSrc("studio")}')">
      <div class="hero-scrim"></div>
      <div class="hero-band">${chars}</div>
      <div class="hero-cap">${caption}</div>
    </div>`;
}

function titleScreen(): string {
  const chars = ROSTER.map((m, i) => `<img class="title-char" style="--i:${i}" src="${charSrc(m, "normal")}" alt="${esc(m)}" />`).join("");
  return `
    <div class="title-screen" style="background-image:url('${bgSrc("venueBig")}')">
      <div class="title-scrim"></div>
      <div class="title-band">${chars}</div>
      <div class="title-copy">
        <div class="title-logo">Metal Road<span>~ SUCCESS! ~</span></div>
        <div class="title-tag">社会人メタルバンド育成シミュレーション</div>
        <button class="btn title-start" id="start">▶ はじめる</button>
      </div>
    </div>`;
}

function partSelectScreen(): string {
  const opts = PARTS.map(
    (p) => `<button class="partopt" data-part="${p.part}">
      <span class="po-part">${p.part}</span><span class="po-label">${p.label}</span></button>`,
  ).join("");
  return `
    <div class="title-screen" style="background-image:url('${bgSrc("backstage")}')">
      <div class="title-scrim"></div>
      <div class="partselect">
        <h2>あなたのパートは？</h2>
        <div class="hint">あなたはこのバンドのリーダー。担当パートを選び、名前を決めよう。</div>
        <div class="partgrid">${opts}</div>
        <div class="namefield">
          <label>リーダー名（任意）</label>
          <input id="leader-name" type="text" maxlength="12" placeholder="例：リョウ" />
        </div>
        <button class="btn partstart" id="confirm-part" disabled>この設定で結成！</button>
      </div>
    </div>`;
}

export function render(root: HTMLElement, state: GameState, ui: UiState, h: Handlers): void {
  if (ui.mode === "title") {
    root.innerHTML = titleScreen();
    root.querySelector("#start")?.addEventListener("click", () => h.onStart());
    return;
  }
  if (ui.mode === "partSelect") {
    root.innerHTML = partSelectScreen();
    let part = "";
    const nameEl = root.querySelector<HTMLInputElement>("#leader-name");
    const startBtn = root.querySelector<HTMLButtonElement>("#confirm-part");
    root.querySelectorAll<HTMLButtonElement>("[data-part]").forEach((el) =>
      el.addEventListener("click", () => {
        part = el.dataset.part!;
        root.querySelectorAll(".partopt").forEach((o) => o.classList.remove("sel"));
        el.classList.add("sel");
        if (startBtn) startBtn.disabled = false;
      }),
    );
    startBtn?.addEventListener("click", () => {
      if (part) h.onChoosePart(part, nameEl?.value ?? "");
    });
    return;
  }

  root.innerHTML = `
    ${topbar(state)}
    ${homeHero(state)}
    <div class="stage">
      ${handView(state)}
      <div class="panel logpanel">
        <h2>ログ</h2>
        <div class="log">${state.log.map((l) => `<div>${esc(l)}</div>`).join("")}</div>
      </div>
    </div>
    ${ui.panel === "members" ? membersPanel(state) : ""}
    ${ui.panel === "appeal" ? appealPanel(state) : ""}
    ${ui.mode === "cardSub" ? cardSubModal(state, ui) : ""}
    ${ui.mode === "staffPick" ? staffPickModal(state) : ""}
    ${ui.mode === "practiceChoice" ? practiceChoiceModal() : ""}
    ${ui.mode === "slides" ? sceneModal(state, ui) : ""}
    ${ui.mode === "live" ? liveModal(state, ui) : ""}
    ${ui.mode === "result" ? resultModal(state, ui) : ""}
  `;

  // Fix up the auto toggle button (kept simple to avoid template noise above).
  const autoBtn = root.querySelector<HTMLButtonElement>("#toggle-auto");
  if (autoBtn) {
    autoBtn.className = `iconbtn auto ${ui.auto ? "on" : ""}`;
    autoBtn.textContent = ui.auto ? "⏸ オート中" : "▶ オート";
  }

  root.querySelectorAll<HTMLButtonElement>("[data-card]").forEach((el) =>
    el.addEventListener("click", () => h.onPlayCard(el.dataset.card as ActionKind)),
  );
  root.querySelectorAll<HTMLButtonElement>("[data-sub]").forEach((el) =>
    el.addEventListener("click", () => h.onChooseSub(el.dataset.sub!)),
  );
  root.querySelectorAll<HTMLButtonElement>("[data-train]").forEach((el) =>
    el.addEventListener("click", () => h.onChooseTraining(el.dataset.train as Param)),
  );
  root.querySelectorAll<HTMLButtonElement>("[data-recruit]").forEach((el) =>
    el.addEventListener("click", () => h.onRecruit(el.dataset.recruit as StaffRole)),
  );
  root.querySelector("#open-members")?.addEventListener("click", () => h.onOpenPanel("members"));
  root.querySelector("#open-appeal")?.addEventListener("click", () => h.onOpenPanel("appeal"));
  root.querySelector("#close-panel")?.addEventListener("click", () => h.onClosePanel());
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
  root.querySelector("#toggle-auto")?.addEventListener("click", () => h.onToggleAuto());

  if (ui.mode === "result") countUp(root);
}
