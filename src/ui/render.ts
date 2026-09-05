// DOM rendering. The board is now a per-turn hand of action cards; member
// stats and the appeal profile live behind buttons (overlays). Scenes and the
// live result are VN-style overlays.

import { appealProfile, K } from "../game/coreLoop";
import { TRAININGS } from "../game/narrative";
import {
  FATIGUE_FLOOR,
  PARTS,
  REQ_LABEL,
  STAFF_CAP,
  STAFF_DEFS,
  bandPower,
  bandStamina,
  canAfford,
  canRecruit,
  cardUnaffordable,
  currentMilestone,
  isCardLocked,
  itemDef,
  nameOf,
  recruitableRoles,
  reqValue,
  staminaTag,
} from "../game/state";
import type { Milestone } from "../game/state";
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
import { ACTION_ICON, actionLabel, paramLabel, PARAMS, segLabel, SEGMENTS, staffLabel } from "../game/types";
import { getLang, L, type Lang } from "../game/i18n";
import { isMuted } from "./audio";
import { bgSrc, charSrc, setEvolution } from "./assets";
import { EVO_LOOK, evolutionInfix, SEG_INFIX } from "../game/evolution";
import { hottestSegment, OPPOSED, rivalOf, songDir, trendIcon, trendMult } from "../game/market";
import { firstLiveTutorial, tutorialStepFor } from "../game/tutorial";

export interface UiState {
  mode: "language" | "title" | "partSelect" | "board" | "cardSub" | "staffPick" | "practiceChoice" | "slides" | "live" | "result" | "gameover" | "clear";
  panel: "none" | "members" | "appeal" | "items";
  pendingCard?: ActionKind; // card whose sub-option is being chosen
  sceneSeq: Scene[];
  sceneIndex: number;
  liveDecision: LiveDecision;
  liveResult?: LiveResult;
  auto: boolean;
}

export interface Handlers {
  onChooseLang: (lang: Lang) => void;
  onToggleLang: () => void;
  onToggleBgm: () => void;
  onStart: () => void;
  onChoosePart: (part: string, name: string) => void;
  onPlayCard: (kind: ActionKind) => void;
  onChooseSub: (subId: string) => void;
  onRecruit: (role: StaffRole) => void;
  onChooseTraining: (param: Param) => void;
  onSlideNext: () => void;
  onChooseReply: (index: number) => void;
  onOpenPanel: (panel: UiState["panel"]) => void;
  onClosePanel: () => void;
  onLiveChange: (patch: Partial<LiveDecision>) => void;
  onConfirmLive: () => void;
  onNextMonth: () => void;
  onToggleAuto: () => void;
  onRestart: () => void;
  onUseItem: (id: string) => void;
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

/** Language + BGM toggles for the header (replaces the floating buttons, which
 *  overlapped content on mobile). Text/icon reflect current state. */
export function hdrControls(): string {
  return `
    <div class="hdr-ctrls">
      <button class="hdr-btn hdr-lang" id="hdr-lang" aria-label="Language / 言語">${getLang() === "en" ? "JA" : "EN"}</button>
      <button class="hdr-btn hdr-bgm" id="hdr-bgm" aria-label="${L("BGMのオン/オフ", "Toggle BGM")}">${isMuted() ? "🔇" : "🔊"}</button>
    </div>`;
}

function topbar(state: GameState): string {
  return `
    <div class="topbar">
      <div class="logo">Metal Road<small>~ SUCCESS! ~</small></div>
      <span class="rankchip rank-${state.rank}">${state.rank === "major" ? "MAJOR" : "INDIE"}</span>
      <div class="stats">
        <div class="stat"><div class="v">${state.month}<span class="turn">·${state.turn}/${state.turnsPerMonth}</span></div><div class="k">${L("月・ターン", "Mo/Turn")}</div></div>
        <div class="stat"><div class="v">${state.totalFans.toLocaleString()}</div><div class="k">${L("ファン", "Fans")}</div></div>
        <div class="stat"><div class="v">${state.fame}</div><div class="k">${L("知名度", "Fame")}</div></div>
        <div class="stat"><div class="v">¥${state.funds.toLocaleString()}</div><div class="k">${L("資金", "Funds")}</div></div>
      </div>
      ${hdrControls()}
    </div>`;
}

/** Persistent stat strip under the topbar: ability ranks + stamina/freshness. */
function statBar(state: GameState): string {
  const avg = (p: Param): number => Math.round(state.members.reduce((a, m) => a + m[p], 0) / (state.members.length || 1));
  const cells: [string, number][] = [
    [L("演奏力", "Power"), bandPower(state)],
    [L("演奏基礎", "Music."), avg("T")],
    [L("パフォ", "Perf."), avg("P")],
    [L("センス", "Song."), avg("S")],
    [L("ビジュ", "Looks"), avg("V")],
  ];
  const cellHtml = cells
    .map(([l, v]) => `<div class="sb-cell"><span class="sb-l">${l}</span><span class="sb-rank g-${grade(v)}">${grade(v)}</span><span class="sb-v">${v}</span></div>`)
    .join("");
  const gauge = (l: string, v: number, cls: string): string =>
    `<div class="sb-gauge"><span class="sb-l">${l}</span><span class="sb-bar ${cls}"><span style="width:${Math.min(100, v)}%"></span></span><span class="sb-v">${v}</span></div>`;
  return `
    <div class="statbar">
      ${cellHtml}
      ${gauge(L("体力", "Stamina"), Math.round(bandStamina(state)), "st")}
      ${gauge(L("鮮度", "Freshness"), Math.round(state.practiceFreshness), "fr")}
    </div>`;
}

/** 愛情度 as five hearts (each = 20 points). */
function loveHearts(love: number): string {
  const filled = Math.max(0, Math.min(5, Math.round(love / 20)));
  return `<span class="hf">${"♥".repeat(filled)}</span><span class="he">${"♡".repeat(5 - filled)}</span>`;
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
        <div class="mname">${esc(m.name)}${m.isLeader ? ' <span class="leadtag">YOU</span>' : `<span class="love">${loveHearts(m.love)}</span>`}</div>
        <div class="gauges">
          ${PARAMS.map((p) => gaugeRow(paramLabel(p), m[p])).join("")}
          ${gaugeRow(L("体力", "Stamina"), m.stamina, "stamina")}
        </div>
      </div>
    </div>`;
}

function staffRow(role: StaffRole, intimacy: number, cut: number): string {
  return `
    <div class="member staffrow">
      <div class="avatar"><div class="head"></div><div class="body" style="background:#5b6b86"></div><div class="part">🎧</div></div>
      <div class="minfo">
        <div class="mname">${staffLabel(role)} <span class="leadtag cut">${L("人件費", "Cut")}${Math.round(cut * 100)}%</span></div>
        <div class="gauges">${gaugeRow(L("親密度", "Rapport"), intimacy)}</div>
      </div>
    </div>`;
}

const evoChipName = (s: string): string => (({
  visual: L("幽艶ゴシック", "Ethereal Goth"),
  core: L("鋼鉄ハードロック", "Steel Hard Rock"),
  light: L("紅黒カワメタ", "Kawaii Metal"),
  expert: L("戦鬼デスメタル", "War Death Metal"),
}) as Record<string, string>)[s];

function evolutionRow(state: GameState): string {
  const chips = SEGMENTS.filter((s) => s in SEG_INFIX)
    .map((s) => {
      const on = !!state.evoUnlocked[s];
      return `<span class="evochip ${on ? "on" : ""}">${segLabel(s)}${L("：", ": ")}${evoChipName(s)}${on ? " ✓" : ""}</span>`;
    })
    .join("");
  const cur = EVO_LOOK[evolutionInfix(state.evoUnlocked)]?.name;
  const now = cur ? `<div class="evonow">${L("現在の姿", "Current look")}：<b>${cur}</b></div>` : "";
  return `<h2 class="sub">${L("✨ 見た目の進化", "✨ Appearance Evolution")}</h2>
    <div class="hint">${L("客層ターゲットでS評価（満足度80+）を取ると解禁。複数解禁で姿が<b>融合</b>、3層以上で<b>究極形態</b>へ。", "S-rank a targeted audience (satisfaction 80+) to unlock its look. Unlock several and they <b>fuse</b>; 3+ becomes the <b>ultimate form</b>.")}</div>
    <div class="evochips">${chips}</div>${now}`;
}

function marketRow(state: GameState): string {
  const rows = SEGMENTS.map((s) => {
    const r = rivalOf(state, s);
    const t = Math.round(trendMult(state, s) * 100);
    const mo = r ? Math.round(r.momentum) : 0;
    const lead = !!r && r.momentum < 40;
    return `<div class="mktrow">
      <span class="mkseg">${segLabel(s)} ${trendIcon(trendMult(state, s))}<b>${t}</b></span>
      <span class="mkriv">${r ? esc(r.name) : ""}</span>
      <span class="mkbar"><i style="width:${mo}%"></i></span>
      <span class="mkmo ${lead ? "lead" : ""}">${lead ? L("優勢", "Lead") : `${L("勢", "M")}${mo}`}</span>
    </div>`;
  }).join("");
  const tie = state.tieup
    ? `<div class="hint">${L("🤝 タイアップ中", "🤝 Tie-up active")}：<b>${segLabel(state.tieup.seg)}</b>${L("層（あと", " (")}${state.tieup.monthsLeft}${L("ヶ月・", " mo left; ")}${segLabel(OPPOSED[state.tieup.seg])}${L("層は不利）", " suffers)")}</div>`
    : "";
  return `<h2 class="sub">${L("📈 市場（トレンド / ライバル）", "📈 Market (Trends / Rivals)")}</h2>
    <div class="hint">${L("数値＝トレンド(100=標準)。バー＝ライバルの勢い（低いほどこちら優勢）。狙う客層でSを取ると相手を押し返す。", "Number = trend (100 = neutral). Bar = rival momentum (lower = you lead). S-rank a segment to push its rival back.")}</div>
    <div class="mkt">${rows}</div>${tie}`;
}

function membersPanel(state: GameState): string {
  const staff = state.staff.length
    ? `<h2 class="sub">${L("🎧 サポート陣", "🎧 Support Crew")}</h2>${state.staff.map((s) => staffRow(s.role, s.intimacy, s.cut)).join("")}`
    : "";
  return `
    <div class="overlay"><div class="panel modal">
      <h2>${L("🎸 メンバー", "🎸 Members")}</h2>
      ${state.members.map(memberCard).join("")}
      ${staff}
      ${evolutionRow(state)}
      ${marketRow(state)}
      <div class="center"><button class="btn secondary" id="close-panel">${L("閉じる", "Close")}</button></div>
    </div></div>`;
}

function staffPickModal(state: GameState): string {
  const opts = recruitableRoles(state)
    .map((r) => {
      const d = STAFF_DEFS[r];
      return `<button class="train" data-recruit="${r}">
        <span class="tname">${staffLabel(r)} <small>(${L("人脈", "Contacts")}-${d.contactCost})</small></span>
        <span class="tdesc">${esc(d.desc)}／${L("人件費", "cut")}${Math.round(d.cut * 100)}%</span>
      </button>`;
    })
    .join("");
  return `
    <div class="overlay"><div class="panel modal">
      <h2>${L("🤝 サポート勧誘", "🤝 Recruit Support")}（${L("人脈", "Contacts")} ${state.contacts} / ${L("枠", "slots")} ${state.staff.length}/${STAFF_CAP}）</h2>
      <div class="hint">${L("加入で活動が拡大。ただしライブ収益から人件費、親密度の管理も必要。", "Support widens what you can do — but they take a cut of live revenue and their rapport must be managed.")}</div>
      <div class="traingrid">${opts}</div>
      <div class="center"><button class="btn secondary" id="close-panel">${L("やめる", "Cancel")}</button></div>
    </div></div>`;
}

function appealPanel(state: GameState): string {
  const prof = appealProfile(state);
  const rows = SEGMENTS.map(
    (s) =>
      `<div class="gauge"><span class="lbl">${segLabel(s)}</span>
        <span class="grade">${grade(prof[s])}</span>
        <span class="bar"><span style="width:${prof[s]}%"></span></span></div>`,
  ).join("");
  return `
    <div class="overlay"><div class="panel modal">
      <h2>${L("📊 セグメント別アピール", "📊 Appeal by Segment")}</h2>
      <div class="hint">${L("バンドの強みがどのファン層に刺さるか（ライブのターゲット選びの参考に）", "Which audience your strengths hit hardest (helps you pick a live target).")}</div>
      ${rows}
      <div class="center"><button class="btn secondary" id="close-panel">${L("閉じる", "Close")}</button></div>
    </div></div>`;
}

function itemCount(state: GameState): number {
  return Object.values(state.items).reduce((a, n) => a + n, 0);
}

function itemsPanel(state: GameState): string {
  const owned = Object.entries(state.items).filter(([, n]) => n > 0);
  const rows = owned.length
    ? owned
        .map(([id, n]) => {
          const d = itemDef(id);
          if (!d) return "";
          return `
      <div class="item">
        <div class="it-head"><span class="it-tier t-${d.tier}">${d.tier}</span><span class="it-name">${esc(d.name)}</span><span class="it-count">×${n}</span></div>
        <div class="it-eff">${esc(d.effect)}</div>
        <div class="it-desc">${esc(d.desc)}</div>
        <div class="it-foot"><button class="btn small" data-use="${id}">${L("使う", "Use")}</button></div>
      </div>`;
        })
        .join("")
    : `<div class="hint">${L("アイテムを持っていない。行動後に見つかることがある。", "No items yet. You may receive some after actions.")}</div>`;
  return `
    <div class="overlay"><div class="panel modal">
      <h2>${L("🎒 アイテム", "🎒 Items")}</h2>
      <div class="hint">${L("説明と効果を確認して使用（使用はターンを消費しません）。", "Check the description and effect, then use it (using an item costs no turn).")}</div>
      <div class="itemlist">${rows}</div>
      <div class="center"><button class="btn secondary" id="close-panel">${L("閉じる", "Close")}</button></div>
    </div></div>`;
}

// --- Hand of action cards (the main board) ---------------------------------

const CARD_HINT: Record<ActionKind, string> = {
  rest: L("完全休養／社会勉強／趣味", "Full rest / study / hobby"),
  music: L("作曲／練習／パフォーマンス", "Compose / practice / perform"),
  promo: L("宣伝で知名度・ファン↑", "Promote: fame & fans up"),
  network: L("バンド／新たな人脈", "Bandmates / new contacts"),
  money: L("バイトで資金を稼ぐ", "Work a part-time job for cash"),
};

function milestoneBanner(state: GameState): string {
  const m = currentMilestone(state);
  if (!m) return "";
  const left = m.deadline - state.month;
  const tone = left <= 1 ? "bad" : left <= 3 ? "warn" : "";
  const rows = (Object.keys(m.req) as (keyof Milestone["req"])[])
    .map((k) => {
      const need = m.req[k]!;
      const cur = reqValue(state, k);
      const ok = cur >= need;
      return `<span class="req ${ok ? "ok" : "ng"}">${REQ_LABEL[k]} ${cur.toLocaleString()}/${need.toLocaleString()}${ok ? " ✓" : ""}</span>`;
    })
    .join("");
  const leftN = Math.max(0, left);
  return `
    <div class="milestone ${tone}">
      <div class="ms-head">${L("🎯 次の関門", "🎯 Next milestone")}：<b>${esc(m.label)}</b> ／ ${L("期限", "by")} ${L(`${m.deadline}ヶ月目`, `month ${m.deadline}`)}${L("（あと", " (")}${leftN}${L("ヶ月・", "mo · ")}${leftN * state.turnsPerMonth}${L("行動）", " actions)")}</div>
      <div class="ms-reqs">${rows}</div>
    </div>`;
}

function endScreen(state: GameState, kind: "gameover" | "clear"): string {
  if (kind === "clear") {
    const band = ROSTER.map((mm, i) => `<img class="title-char" style="--i:${i}" src="${charSrc(mm, "happy")}" alt="${esc(mm)}" />`).join("");
    return `
      <div class="endscreen clear" style="background-image:url('${bgSrc("venueBig")}')">
        <div class="title-scrim"></div>
        <div class="title-band">${band}</div>
        <div class="end-copy">
          <div class="end-logo win">CONGRATULATIONS!</div>
          <div class="end-sub">${L("海外進出を成し遂げ、Metal Road は世界へ羽ばたいた！", "Metal Road broke overseas and took flight across the world!")}</div>
          <div class="end-stat">${L("クリア：", "Cleared in ")}${L(`${state.month}ヶ月`, `${state.month} mo`)}${L(" ／ ファン ", " / Fans ")}${state.totalFans.toLocaleString()}</div>
          <button class="btn title-start" id="restart">${L("▶ もう一度はじめる", "▶ Play again")}</button>
        </div>
      </div>`;
  }
  const m = currentMilestone(state);
  return `
    <div class="endscreen gameover" style="background-image:url('${bgSrc("backstage")}')">
      <div class="title-scrim"></div>
      <div class="end-copy">
        <div class="end-logo lose">GAME OVER</div>
        <div class="end-sub">${m ? esc(m.label) + L("の期限に間に合わず、バンドは解散した…", " wasn't reached in time — the band broke up…") : L("バンドは解散した…", "The band broke up…")}</div>
        <div class="end-stat">${L(`${state.month}ヶ月の活動`, `${state.month} months active`)}${L(" ／ ファン ", " / Fans ")}${state.totalFans.toLocaleString()}${L(" ／ 到達 ", " / Reached ")}${state.stage}${L("関門", " milestones")}</div>
        <button class="btn title-start" id="restart">${L("▶ もう一度はじめる", "▶ Play again")}</button>
      </div>
    </div>`;
}

type MuseMood = "normal" | "happy" | "sad" | "fired";
const MUSE_GENERAL: { art: string; mood: MuseMood; line: string }[] = [
  { art: "RYO", mood: "normal", line: L("「さーて、今日はどう暴れよっか？」", "\"So, how do we tear it up today?\"") },
  { art: "KEN", mood: "normal", line: L("「詰められるとこは、まだいくらでもある」", "\"There's still plenty left to sharpen.\"") },
  { art: "MIO", mood: "normal", line: L("「……何から、手をつける？」", "\"...Where do we start?\"") },
  { art: "GO", mood: "happy", line: L("「今日もいっぱい動くぞー！何する何するっ？」", "\"Let's do tons today! What's next, what's next?\"") },
  { art: "RYO", mood: "happy", line: L("「悩むのも楽しいけど、そろそろ決めよ？」", "\"Fun to mull it over, but let's decide, yeah?\"") },
  { art: "MIO", mood: "normal", line: L("「焦らず、いこ」", "\"No rush. Let's go.\"") },
];

/** A bandmate musing over what to do this turn (playful board flavor). Stable
 *  per turn (keyed by month/turn), context-aware for fatigue / stale songs / cash. */
// Hand-aware board comments: keyed by the two non-rest cards on offer, so the
// bandmate's line nudges toward what's actually available this turn (e.g. no
// music card → talk up promotion / connections). Falls back to MUSE_GENERAL.
const HAND_MUSE: Record<string, { art: string; mood: MuseMood; line: string }[]> = {
  "music,promo": [
    { art: "RYO", mood: "fired", line: L("「鍛えるか、広めるか。今日は攻めの二択だな」", "\"Sharpen up or spread the word — an aggressive pair of options today.\"") },
    { art: "KEN", mood: "normal", line: L("「音を磨くのも、知ってもらうのも、どっちも武器だ」", "\"Polishing the sound or getting noticed — both are weapons.\"") },
  ],
  "music,network": [
    { art: "KEN", mood: "normal", line: L("「腕を磨くのも、人脈を作るのも、遠回りに見えて近道だ」", "\"Sharpening our skills or building connections — both are shortcuts in disguise.\"") },
    { art: "MIO", mood: "normal", line: L("「音を詰めるか、仲間と語らうか……今日はどっち？」", "\"Tighten the sound, or talk it out with the crew... which today?\"") },
  ],
  "money,music": [
    { art: "MIO", mood: "normal", line: L("「音を磨くか、軍資金を稼ぐか。地に足つけていこ」", "\"Polish the sound or earn some funds. Let's keep our feet on the ground.\"") },
    { art: "GO", mood: "happy", line: L("「練習もバイトも全力！ どっちも大事だもんね！」", "\"Give practice and the part-time job everything! Both matter!\"") },
  ],
  "network,promo": [
    { art: "MIO", mood: "normal", line: L("「曲づくりはお預け。どうやってバンドを知ってもらうかも大事だよ」", "\"No songwriting today. How we get the band known matters too.\"") },
    { art: "RYO", mood: "normal", line: L("「今日は音出しはナシか。じゃあ、名前の売り方で勝負だ」", "\"No playing today, huh. Then let's win on getting our name out.\"") },
  ],
  "money,promo": [
    { art: "RYO", mood: "normal", line: L("「先立つものと、宣伝か。地味だけど、じわじわ効くぞ」", "\"Seed money and promotion, huh. Unshowy, but it pays off slowly.\"") },
    { art: "GO", mood: "happy", line: L("「稼いで広めて——今日は縁の下、がんばるぞっ！」", "\"Earn and spread the word — grunt work today, let's go!\"") },
  ],
  "money,network": [
    { art: "MIO", mood: "normal", line: L("「軍資金も人脈も、コツコツが効いてくるんだ」", "\"Funds and connections both — chipping away is what pays off.\"") },
    { art: "GO", mood: "happy", line: L("「バイトか、仲間と作戦会議か！ どっちも楽しそう！」", "\"A shift, or a strategy huddle with the crew! Both sound fun!\"") },
  ],
};

/** The two non-rest cards in hand, as a sorted key ("network,promo"). */
function handKey(state: GameState): string {
  return state.hand.map((c) => c.kind).filter((k) => k !== "rest").sort().join(",");
}

function boardMuse(state: GameState): string {
  let art: string, mood: MuseMood, line: string;
  const newest = state.songs.reduce((a, s) => Math.min(a, s.age), 99);
  const idx = state.month * 3 + state.turn;
  const handPool = HAND_MUSE[handKey(state)];
  if (bandStamina(state) < FATIGUE_FLOOR) {
    art = "GO"; mood = "sad"; line = L("「もう体力げんかい…今日は休も？ ね？」", "\"I'm running on empty... let's rest today? Please?\"");
  } else if (newest >= 4) {
    art = "KEN"; mood = "normal"; line = L("「そろそろ新曲、書かないか。ネタは腐るぞ」", "\"Time to write a new song. Ideas go stale.\"");
  } else if (state.funds < 150 * K.venueCostPerSeat) {
    art = "MIO"; mood = "normal"; line = L("「……お金、心もとない。バイトも要るかも」", "\"...Cash is thin. We may need a shift.\"");
  } else if (handPool) {
    const m = handPool[idx % handPool.length];
    art = m.art; mood = m.mood; line = m.line;
  } else {
    const m = MUSE_GENERAL[idx % MUSE_GENERAL.length];
    art = m.art; mood = m.mood; line = m.line;
  }
  return `<div class="boardmuse">
    <img class="muse-char" src="${charSrc(art, mood)}" alt="${esc(nameOf(state, art))}"/>
    <div class="muse-bubble"><span class="muse-name">${esc(nameOf(state, art))}</span>${esc(line)}</div>
  </div>`;
}

/** Hands-on tutorial coach box on the board: which action to take this turn and
 *  the effect it produces. Returns "" outside the scripted run-up. */
function tutorialCoach(state: GameState): string {
  const ts = tutorialStepFor(state);
  if (!ts) return "";
  return `<div class="tutorial-coach">
    <img class="tc-char" src="${charSrc(ts.coach, "fired")}" alt="${esc(nameOf(state, ts.coach))}"/>
    <div class="tc-body">
      <div class="tc-tag">${L("📘 チュートリアル", "📘 Tutorial")} · ${esc(ts.step)}</div>
      <div class="tc-text">${esc(ts.body)}</div>
      <div class="tc-cta">${L("▼ 下のカードをタップ", "▼ Tap the card below")}</div>
    </div>
  </div>`;
}

function handView(state: GameState): string {
  const cards = state.hand
    .map((c) => {
      const tired = isCardLocked(state, c.kind);
      const broke = !tired && cardUnaffordable(state, c);
      const locked = tired || broke;
      const hint = tired
        ? L("疲労で行動不可", "Too tired to act")
        : broke
          ? L("資金不足で行動不可", "Too broke to act")
          : CARD_HINT[c.kind];
      return `
      <button class="actcard ${c.kind} ${locked ? "locked" : ""}" data-card="${c.kind}" ${locked ? "disabled" : ""}>
        <span class="ac-ico">${ACTION_ICON[c.kind]}</span>
        <span class="ac-name">${actionLabel(c.kind)}</span>
        <span class="ac-hint">${hint}</span>
        <span class="ac-sta">${staminaTag(c.kind)}</span>
      </button>`;
    })
    .join("");
  const newest = state.songs.reduce((a, s) => Math.min(a, s.age), 99);
  const songTone = newest <= 1 ? "" : newest <= 3 ? "warn" : "bad";
  const fatigued = bandStamina(state) < FATIGUE_FLOOR;
  return `
    <div class="panel boardpanel">
      <h2>${L(`${state.month}ヶ月目 ・ ターン ${state.turn}/${state.turnsPerMonth} — 行動を選択`, `Month ${state.month} · Turn ${state.turn}/${state.turnsPerMonth} — Choose an action`)}</h2>
      ${milestoneBanner(state)}
      <div class="handbar">
        <span class="meter ${songTone}">${L("最新曲", "Newest")} ${newest === 0 ? "NEW" : `${newest}${L("ヶ月前", "mo ago")}`}</span>
        <span class="meter">🤝 ${L("人脈", "Contacts")} ${state.contacts}</span>
        <span class="meter">🔥 ${L("結束", "Bond")} ${Math.round(state.bond)}</span>
        ${state.staff.length ? `<span class="meter">🎧 ${L("サポート", "Support")} ${state.staff.length}/${STAFF_CAP}</span>` : ""}
      </div>
      ${fatigued ? `<div class="fatigue-note">${L("メンバーは疲労困憊…「休息」でしか動けない。しっかり休もう。", "The band is exhausted — only Rest is available. Get some rest.")}</div>` : ""}
      ${tutorialCoach(state) || boardMuse(state)}
      <div class="hand">${cards}</div>
      <div class="dicebar">
        <div class="navbtns">
          <button class="iconbtn auto" id="toggle-auto">${L("▶ オート", "▶ Auto")}</button>
          <button class="iconbtn" id="open-items">🎒 ${L("アイテム", "Items")} ${itemCount(state)}</button>
          <button class="iconbtn" id="open-members">🎸 ${L("メンバー", "Members")}</button>
          <button class="iconbtn" id="open-appeal">📊 ${L("アピール", "Appeal")}</button>
        </div>
      </div>
    </div>`;
}

function cardSubModal(state: GameState, ui: UiState): string {
  const kind = ui.pendingCard!;
  const card = state.hand.find((c) => c.kind === kind);
  const subs = card?.subs ?? [];
  const opts = subs
    .map((s) => {
      const broke = !canAfford(state, kind, s.id);
      const fee = kind === "music" && s.id === "compose" ? K.feeCompose : kind === "music" && s.id === "practice" ? K.feePractice : 0;
      return `<button class="train ${broke ? "locked" : ""}" data-sub="${s.id}" ${broke ? "disabled" : ""}>
        <span class="tname">${s.label}</span>
        <span class="tdesc">${broke ? L(`資金不足（¥${fee.toLocaleString()}必要）`, `Not enough (need ¥${fee.toLocaleString()})`) : esc(s.desc)}</span>
      </button>`;
    })
    .join("");
  const recruit =
    kind === "network" && canRecruit(state)
      ? `<button class="train recruit" data-sub="recruit">
        <span class="tname">🤝 ${L("サポート勧誘", "Recruit Support")}</span>
        <span class="tdesc">${L("人脈を使ってサポート陣を招く（人脈 ", "Spend contacts to recruit support (Contacts ")}${state.contacts}${L("）", ")")}</span>
      </button>`
      : "";
  return `
    <div class="overlay"><div class="panel modal">
      <h2>${ACTION_ICON[kind]} ${actionLabel(kind)} — ${L("内容を選択", "Choose")}</h2>
      <div class="traingrid">${opts}${recruit}</div>
      <div class="center"><button class="btn secondary" id="close-panel">${L("やめる", "Cancel")}</button></div>
    </div></div>`;
}

const TRAIN_ICON: Record<Param, string> = { T: "🥁", P: "🎤", S: "🎼", V: "🖤" };

function practiceChoiceModal(): string {
  const opts = PARAMS.map((p) => {
    const t = TRAININGS[p];
    return `<button class="train" data-train="${p}">
        <span class="tart">${TRAIN_ICON[p]}</span>
        <span class="tname">${paramLabel(p)}</span>
        <span class="tdesc">${esc(t.name)}${L(" ／ ", " / ")}+6</span>
      </button>`;
  }).join("");
  return `
    <div class="overlay"><div class="panel modal">
      <h2>${L("🎸 練習メニューを選択", "🎸 Choose a Practice")}</h2>
      <div class="hint">${L("どの能力を伸ばす？ 全員に効果。", "Which ability to raise? Affects all members.")}</div>
      <div class="traingrid">${opts}</div>
      <div class="center"><button class="btn secondary" id="close-panel">${L("やめる", "Cancel")}</button></div>
    </div></div>`;
}

function sceneModal(state: GameState, ui: UiState): string {
  const s = ui.sceneSeq[ui.sceneIndex];
  const last = ui.sceneIndex === ui.sceneSeq.length - 1;
  const dots = ui.sceneSeq
    .map((_, i) => `<span class="dot ${i === ui.sceneIndex ? "on" : ""}"></span>`)
    .join("");
  // On mobile only the "primary" character is shown (kept large); desktop shows all.
  const speakerIdx = s.speaker
    ? s.chars.findIndex((c) => c.member === s.speaker || nameOf(state, c.member) === s.speaker)
    : -1;
  const centerIdx = s.chars.findIndex((c) => c.pos === "center");
  const primaryIdx = speakerIdx >= 0 ? speakerIdx : centerIdx >= 0 ? centerIdx : 0;
  const chars = s.chars
    .map(
      (c, i) =>
        `<img class="sc-char ${c.pos} ${i === primaryIdx ? "primary" : ""} mood-${c.mood ?? "normal"}" src="${charSrc(c.member, c.mood ?? "normal")}" alt="${esc(nameOf(state, c.member))}" />`,
    )
    .join("");
  const speaker = s.speaker ? `<div class="sc-speaker">${esc(nameOf(state, s.speaker))}</div>` : "";
  const fx = s.fx === "flash" ? `<div class="sc-flash"></div>` : "";
  const foot = s.choices?.length
    ? `<div class="sc-choices">${s.choices
        .map((c, i) => `<button class="btn sc-choice" data-choice="${i}">${esc(c.label)}</button>`)
        .join("")}</div>`
    : `<div class="sc-foot">
            <div class="dots">${dots}</div>
            <button class="btn" id="scene-next">${last ? L("完了", "Done") : L("次へ ▶", "Next ▶")}</button>
          </div>`;
  return `
    <div class="overlay scene-overlay">
      <div class="scene ${s.fx === "shake" ? "shake" : ""}" style="background-image:url('${bgSrc(s.bg)}')">
        <div class="sc-stage" style="--n:${Math.max(1, s.chars.length)}">${chars}</div>
        ${fx}
        <div class="sc-textbox">
          ${speaker}
          <div class="sc-text">${esc(s.text)}</div>
          ${foot}
        </div>
      </div>
    </div>`;
}

const venueName = (cap: number): string =>
  cap <= 200 ? L("小箱ライブハウス", "Small Club") : cap <= 600 ? L("ライブホール", "Live Hall") : L("大ホール", "Grand Hall");

function liveModal(state: GameState, ui: UiState): string {
  const d = ui.liveDecision;
  const caps = state.rank === "major" ? [500, 1200, 2500] : [150, 500, 1200];
  const capOpts = caps
    .map((c) => {
      const cost = c * K.venueCostPerSeat;
      const locked = state.funds < cost;
      return `<button class="opt ${d.cap === c ? "sel" : ""} ${locked ? "locked" : ""}" data-cap="${c}" ${locked ? "disabled" : ""}>
        ${venueName(c)}<span class="capn">${c}${L("人 / 会場費¥", " seats / venue ¥")}${cost.toLocaleString()}</span></button>`;
    })
    .join("");
  const segOpts = SEGMENTS.map((s) => {
    const r = rivalOf(state, s);
    const rivalMark = r ? (r.momentum >= 60 ? "⚔️" : r.momentum < 40 ? "👑" : "") : "";
    const tieMark = state.tieup?.seg === s ? "🤝" : "";
    return `<button class="opt ${d.target === s ? "sel" : ""}" data-target="${s}">${segLabel(s)} <span class="segmk">${trendIcon(trendMult(state, s))}${rivalMark}${tieMark}</span></button>`;
  }).join("");
  const songOpts = state.songs
    .map(
      (sg, i) =>
        `<button class="opt ${d.songIndex === i ? "sel" : ""}" data-song="${i}">${esc(sg.name)}<span class="capn">Q${sg.Q}・${segLabel(songDir(sg.lean))}${L("寄り", " lean")}${sg.age === 0 ? "・NEW" : `・${sg.age}${L("ヶ月", "mo")}`}</span></button>`,
    )
    .join("");
  const hot = hottestSegment(state);
  const tieLine = state.tieup
    ? `　🤝 <b>${segLabel(state.tieup.seg)}</b>${L("層タイアップ中（あと", " tie-up active (")}${state.tieup.monthsLeft}${L("ヶ月）", "mo)")}`
    : "";
  const marketStrip = `<div class="hint marketstrip">${L("📈 今月の注目客層", "📈 Hot audience")}：<b>${segLabel(hot)}</b> ${trendIcon(trendMult(state, hot))}${tieLine}
    <br><span class="legend">${L("🔥高い／❄️低いトレンド ・ ⚔️ライバル強い ・ 👑こちらが優勢 ・ 🤝タイアップ層", "🔥high/❄️low trend · ⚔️strong rival · 👑you lead · 🤝tie-up segment")}</span></div>`;
  const cost = d.cap * K.venueCostPerSeat;
  const canPay = state.funds >= cost;
  return `
    <div class="overlay"><div class="panel modal">
      <h2>${L("🎤 月末ライブ — 意思決定", "🎤 Month-end Live — Decisions")}</h2>
      ${firstLiveTutorial(state) ? `<div class="tutorial-coach live">
        <img class="tc-char" src="${charSrc("RYO", "fired")}" alt="${esc(nameOf(state, "RYO"))}"/>
        <div class="tc-body">
          <div class="tc-tag">${L("📘 チュートリアル · 初めてのライブ", "📘 Tutorial · Your First Live")}</div>
          <div class="tc-text">${L("ライブは3つを決めるぞ。①<b>会場キャパ</b>＝動員の上限。会場費を前払いするので、埋められる規模を選ぶのがコツ（大きすぎると空席で満足度も収支も落ちる）。②<b>客層</b>＝どのファン層を狙うか。トレンド🔥・ライバル弱・タイアップ層が狙い目。③<b>セットリスト</b>＝曲。曲の「〜寄り」が客層と噛み合うほど盛り上がる。満足度が高いほど新規ファンと売上が伸びる！", "A live is three decisions. ① <b>Venue capacity</b> = your attendance cap. You pay the fee up front, so pick a size you can fill (too big = empty seats drag down satisfaction and profit). ② <b>Audience</b> = which fan segment to target — aim for a hot trend 🔥, weak rival, or tie-up segment. ③ <b>Setlist</b> = the song; the better its lean matches the audience, the bigger the response. Higher satisfaction means more new fans and revenue!")}</div>
        </div>
      </div>` : ""}
      ${marketStrip}
      <div class="field"><label>${L("会場キャパ（会場費を前払い）", "Venue capacity (pay the fee up front)")}</label><div class="opts">${capOpts}</div>
        <div class="hint">${L("資金が足りない規模は選べない。序盤はバイトで会場費を稼ごう。", "You can't book a venue you can't afford — work part-time to save up early on.")}</div></div>
      <div class="field"><label>${L("ターゲットとするファン層", "Target audience segment")}</label><div class="opts">${segOpts}</div>
        <div class="hint">${L("トレンド高・ライバル弱・タイアップ層を突くと新規ファンが伸びる。", "Hitting a hot trend / weak rival / tie-up segment pulls more new fans.")}</div></div>
      <div class="field"><label>${L("セットリスト（楽曲）", "Setlist (song)")}</label><div class="opts">${songOpts}</div>
        <div class="hint">${L("曲の「〜寄り」がターゲット層と噛み合うほどマッチ度UP。", "The better a song's lean matches your target segment, the higher the match.")}</div></div>
      ${state.buffs.liveSat !== 0 || state.buffs.liveSellout ? `<div class="hint buffnote">${L("🎒 発動中", "🎒 Active")}：${state.buffs.liveSellout ? L("動員満員 ", "sellout ") : ""}${state.buffs.liveSat !== 0 ? `${L("満足度", "satisfaction")}${state.buffs.liveSat > 0 ? "+" : ""}${state.buffs.liveSat}` : ""}</div>` : ""}
      <div class="center">
        <button class="btn secondary" id="open-items">🎒 ${L("アイテム", "Items")} ${itemCount(state)}</button>
        <button class="btn" id="confirm-live" ${canPay ? "" : "disabled"}>${canPay ? L("この方針でライブ実施！", "Play the live!") : L("資金不足（会場費が払えない）", "Not enough for the venue fee")}</button>
      </div>
    </div></div>`;
}

function liveVerdict(sat: number): { rank: string; tone: string; line: string } {
  if (sat >= 80) return { rank: "S", tone: "legend", line: L("伝説のライブ！会場が一つになった！", "A legendary show — the whole room became one!") };
  if (sat >= 70) return { rank: "A", tone: "great", line: L("最高のステージ！確かな手応え！", "A killer set — real momentum!") };
  if (sat >= 60) return { rank: "B", tone: "good", line: L("良いライブだった。爪痕を残した。", "A good show. You left a mark.") };
  if (sat >= 50) return { rank: "C", tone: "good", line: L("悪くない。次につながる出来。", "Not bad — something to build on.") };
  if (sat >= 40) return { rank: "D", tone: "poor", line: L("盛り上がりは今ひとつ…。", "The energy never quite caught…") };
  return { rank: "E", tone: "poor", line: L("課題の残るライブになった…。", "A show with a lot left to fix…") };
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
          <div class="result-title"><h2>${L("ライブ結果 — ", "Live Result — ")}${L(`${state.month}ヶ月目`, `Month ${state.month}`)}</h2><div class="verdict">${v.line}</div>${r.trouble ? `<div class="trouble">${L("⚠ 当日トラブル発生（PA親密度不足）", "⚠ Trouble on the day (low PA rapport)")}</div>` : ""}</div>
          ${r.soldOut ? '<div class="soldout">SOLD<br>OUT</div>' : ""}
        </div>
        <div class="kpis">
          <div class="kpi"><div class="v" data-count="${r.draw}">0</div><div class="sub">/${r.capacity.toLocaleString()}</div><div class="k">${L("動員数", "Attendance")} ${r.soldOut ? "🎉" : `${Math.round(r.occupancy * 100)}%`}</div></div>
          <div class="kpi"><div class="v" data-count="${r.satisfaction}">0</div><div class="k">${L("観客満足度", "Satisfaction")}</div></div>
          <div class="kpi"><div class="v pos" data-count="${r.newFans}" data-prefix="+">0</div><div class="k">${L("新規ファン", "New Fans")}</div></div>
          <div class="kpi"><div class="v" data-count="${r.streams}">0</div><div class="k">${L("ストリーミング再生", "Streams")}</div></div>
        </div>
        <div class="kpi money-row">
          <div class="v money ${money}">${sign}¥${Math.abs(Math.round(r.profit)).toLocaleString()}</div>
          <div class="k">${L("収支（売上¥", "Net (revenue ¥")}${Math.round(r.revenue).toLocaleString()}${L(" − 経費¥", " − costs ¥")}${Math.round(r.cost).toLocaleString()}${r.staffCost > 0 ? `${L("／うち人件費¥", " / incl. staff ¥")}${r.staffCost.toLocaleString()}` : ""}${L("）", ")")}</div>
        </div>
        <div class="center"><button class="btn" id="next-month">${L("次の月へ →", "Next month →")}</button></div>
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
  const caption = avg <= 40 ? L("🎸 練習スタジオ — 少しお疲れ気味…", "🎸 Rehearsal Studio — a bit worn out…") : L("🎸 練習スタジオ — バンドの日常", "🎸 Rehearsal Studio — band life");
  return `
    <div class="home-hero" style="background-image:url('${bgSrc("studio")}')">
      <div class="hero-scrim"></div>
      <div class="hero-band">${chars}</div>
      <div class="hero-cap">${caption}</div>
    </div>`;
}

function languageScreen(): string {
  return `
    <div class="title-screen" style="background-image:url('${bgSrc("venueBig")}')">
      <div class="title-scrim"></div>
      <div class="title-copy">
        <div class="title-logo">Metal Road<span>~ SUCCESS! ~</span></div>
        <div class="title-tag">言語を選択 ／ Select Language</div>
        <div class="langpick">
          <button class="btn" data-lang="ja">日本語</button>
          <button class="btn" data-lang="en">English</button>
        </div>
      </div>
    </div>`;
}

function titleScreen(): string {
  const chars = ROSTER.map((m, i) => `<img class="title-char" style="--i:${i}" src="${charSrc(m, "normal")}" alt="${esc(m)}" />`).join("");
  return `
    <div class="title-screen" style="background-image:url('${bgSrc("venueBig")}')">
      <div class="title-scrim"></div>
      ${hdrControls()}
      <div class="title-band">${chars}</div>
      <div class="title-copy">
        <div class="title-logo">Metal Road<span>~ SUCCESS! ~</span></div>
        <div class="title-tag">${L("社会人メタルバンド育成シミュレーション", "A working-adult metal band management sim")}</div>
        <button class="btn title-start" id="start">${L("▶ はじめる", "▶ Start")}</button>
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
      ${hdrControls()}
      <div class="partselect">
        <h2>${L("あなたのパートは？", "What's your part?")}</h2>
        <div class="hint">${L("あなたはこのバンドのリーダー。担当パートを選び、名前を決めよう。", "You're the band's leader. Pick your instrument and set a name.")}</div>
        <div class="partgrid">${opts}</div>
        <div class="namefield">
          <label>${L("リーダー名（任意）", "Leader name (optional)")}</label>
          <input id="leader-name" type="text" maxlength="12" placeholder="${L("パートを選ぶと初期名が入ります", "Pick a part for a default name")}" />
        </div>
        <button class="btn partstart" id="confirm-part" disabled>${L("この設定で結成！", "Form the band!")}</button>
      </div>
    </div>`;
}

/** Bind the header language + BGM toggles (present on title + gameplay). */
function bindHdr(root: HTMLElement, h: Handlers): void {
  root.querySelector("#hdr-lang")?.addEventListener("click", () => h.onToggleLang());
  root.querySelector("#hdr-bgm")?.addEventListener("click", () => h.onToggleBgm());
}

export function render(root: HTMLElement, state: GameState, ui: UiState, h: Handlers): void {
  setEvolution(evolutionInfix(state.evoUnlocked)); // pick the sprite variant for this frame
  if (ui.mode === "language") {
    root.innerHTML = languageScreen();
    root.querySelectorAll<HTMLButtonElement>("[data-lang]").forEach((el) =>
      el.addEventListener("click", () => h.onChooseLang(el.dataset.lang as Lang)));
    return;
  }
  if (ui.mode === "title") {
    root.innerHTML = titleScreen();
    root.querySelector("#start")?.addEventListener("click", () => h.onStart());
    bindHdr(root, h);
    return;
  }
  if (ui.mode === "gameover" || ui.mode === "clear") {
    root.innerHTML = endScreen(state, ui.mode);
    root.querySelector("#restart")?.addEventListener("click", () => h.onRestart());
    return;
  }
  if (ui.mode === "partSelect") {
    root.innerHTML = partSelectScreen();
    bindHdr(root, h);
    let part = "";
    const nameEl = root.querySelector<HTMLInputElement>("#leader-name");
    const startBtn = root.querySelector<HTMLButtonElement>("#confirm-part");
    root.querySelectorAll<HTMLButtonElement>("[data-part]").forEach((el) =>
      el.addEventListener("click", () => {
        part = el.dataset.part!;
        root.querySelectorAll(".partopt").forEach((o) => o.classList.remove("sel"));
        el.classList.add("sel");
        // Show that part's default name (used if the player leaves the field blank).
        const def = PARTS.find((p) => p.part === part)?.name ?? "";
        if (nameEl) nameEl.placeholder = def;
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
    ${statBar(state)}
    ${homeHero(state)}
    <div class="stage">
      ${handView(state)}
      <div class="panel logpanel">
        <h2>${L("ログ", "Log")}</h2>
        <div class="log">${state.log.map((l) => `<div>${esc(l)}</div>`).join("")}</div>
      </div>
    </div>
    ${ui.mode === "cardSub" ? cardSubModal(state, ui) : ""}
    ${ui.mode === "staffPick" ? staffPickModal(state) : ""}
    ${ui.mode === "practiceChoice" ? practiceChoiceModal() : ""}
    ${ui.mode === "slides" ? sceneModal(state, ui) : ""}
    ${ui.mode === "live" ? liveModal(state, ui) : ""}
    ${ui.mode === "result" ? resultModal(state, ui) : ""}
    ${ui.panel === "members" ? membersPanel(state) : ""}
    ${ui.panel === "appeal" ? appealPanel(state) : ""}
    ${ui.panel === "items" ? itemsPanel(state) : ""}
  `;

  // Fix up the auto toggle button (kept simple to avoid template noise above).
  const autoBtn = root.querySelector<HTMLButtonElement>("#toggle-auto");
  if (autoBtn) {
    autoBtn.className = `iconbtn auto ${ui.auto ? "on" : ""}`;
    autoBtn.textContent = ui.auto ? L("⏸ オート中", "⏸ Auto on") : L("▶ オート", "▶ Auto");
  }

  bindHdr(root, h);
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
  root.querySelectorAll("#open-items").forEach((el) => el.addEventListener("click", () => h.onOpenPanel("items")));
  root.querySelectorAll<HTMLButtonElement>("[data-use]").forEach((el) =>
    el.addEventListener("click", () => h.onUseItem(el.dataset.use!)),
  );
  root.querySelector("#close-panel")?.addEventListener("click", () => h.onClosePanel());
  root.querySelector("#scene-next")?.addEventListener("click", () => h.onSlideNext());
  root.querySelectorAll<HTMLButtonElement>("[data-choice]").forEach((el) =>
    el.addEventListener("click", () => h.onChooseReply(Number(el.dataset.choice))),
  );
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
