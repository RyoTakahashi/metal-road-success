// Game state, the per-turn action-card hand, and action resolution.
// Progression is a monthly loop: turnsPerMonth action cards, then a live.
// See docs/phase1-cards.md.

import { bandParam, SEG_WEIGHTS } from "./coreLoop";
import { EVO_LOOK, evolutionInfix } from "./evolution";
import { acceptTieup, initMarket, leanToward, tickMarket } from "./market";
import { tutorialActive, tutorialStepFor } from "./tutorial";
import { L } from "./i18n";
import {
  composeScenes,
  contactScenes,
  itemFindScenes,
  itemUseScenes,
  moneyScenes,
  performScenes,
  pick,
  practiceScenes,
  promoScenes,
  restScenes,
} from "./flavor";
import type {
  ActionCard,
  ActionKind,
  BgKey,
  GameState,
  LiveDecision,
  LiveResult,
  Member,
  Param,
  Scene,
  SceneChoice,
  Segment,
  StaffRole,
} from "./types";
import { paramLabel, segLabel, SEGMENTS, staffLabel } from "./types";

const TURNS_PER_MONTH = 4;
const clampStat = (n: number) => Math.max(0, Math.min(99, n));
const yen = (n: number) => `¥${n.toLocaleString()}`;

/** Below this average stamina the band is too exhausted to do anything but rest. */
export const FATIGUE_FLOOR = 25;

/** Average band stamina (0–100). */
export const bandStamina = (s: GameState): number =>
  s.members.reduce((a, m) => a + m.stamina, 0) / (s.members.length || 1);

/** A non-rest card is locked when the band is exhausted (forces 休息). */
export const isCardLocked = (s: GameState, kind: ActionKind): boolean =>
  kind !== "rest" && bandStamina(s) < FATIGUE_FLOOR;

/** Short stamina hint shown on a card. */
export function staminaTag(kind: ActionKind): string {
  if (kind === "rest") return L("体力 回復", "Stamina up");
  if (kind === "network") return L("体力+ / 人脈・結束", "Stamina+ / contacts & bond");
  return L("体力 消費", "Costs stamina");
}

// --- Support staff (P2-2/3/4) ----------------------------------------------

export const STAFF_DEFS: Record<StaffRole, { cut: number; contactCost: number; desc: string }> = {
  producer: { cut: 0.15, contactCost: 4, desc: L("毎ターンの手札 +1・作曲Q↑。ただし大箱志向の外圧（小箱続きで親密度↓）", "+1 card each turn, higher song Q — but pushes for big venues (small ones cost rapport).") },
  manager: { cut: 0.1, contactCost: 3, desc: L("宣伝到達（マーケ力）が上がり動員が伸びる", "Raises promo reach (marketing), boosting attendance.") },
  pa: { cut: 0.08, contactCost: 3, desc: L("ライブ満足度が上がる。親密度が低いと当日トラブル", "Raises live satisfaction; low rapport risks trouble on the day.") },
  roadie: { cut: 0.06, contactCost: 3, desc: L("行動の体力消費を軽減・トラブルを抑える", "Eases stamina costs and reduces trouble.") },
};
export const STAFF_CAP = 3;
export const hasStaff = (s: GameState, role: StaffRole): boolean => s.staff.some((x) => x.role === role);
export const recruitableRoles = (s: GameState): StaffRole[] =>
  (Object.keys(STAFF_DEFS) as StaffRole[]).filter((r) => !hasStaff(s, r) && s.contacts >= STAFF_DEFS[r].contactCost);
/** Support staff can be scouted once major, with spare 人脈 and an open slot. */
export const canRecruit = (s: GameState): boolean =>
  s.rank === "major" && s.staff.length < STAFF_CAP && recruitableRoles(s).length > 0;

/** The four founding members (Vo/Gt/Ba/Dr). artKey is the sprite key. */
function initialMembers(): Member[] {
  return [
    { name: "RISA", artKey: "RYO", part: "Vo", isLeader: false, T: 48, P: 60, S: 52, V: 58, stamina: 100, love: 30 },
    { name: "NAO", artKey: "KEN", part: "Gt", isLeader: false, T: 64, P: 50, S: 55, V: 46, stamina: 100, love: 30 },
    { name: "MAKO", artKey: "MIO", part: "Ba", isLeader: false, T: 58, P: 46, S: 50, V: 44, stamina: 100, love: 30 },
    { name: "TOMO", artKey: "GO", part: "Dr", isLeader: false, T: 62, P: 44, S: 42, V: 40, stamina: 100, love: 30 },
  ];
}

/** Which existing member plays a given part. */
const PART_TO_ART: Record<string, string> = { Vo: "RYO", Gt: "KEN", Ba: "MIO", Dr: "GO" };
export const PARTS: { part: string; label: string; name: string }[] = [
  { part: "Vo", label: L("ボーカル", "Vocals"), name: "RISA" },
  { part: "Gt", label: L("ギター", "Guitar"), name: "NAO" },
  { part: "Ba", label: L("ベース", "Bass"), name: "MAKO" },
  { part: "Dr", label: L("ドラム", "Drums"), name: "TOMO" },
];

/** Start a fresh game as the leader of the chosen part (optionally renamed). */
export function newGame(part = "Vo", leaderName = "", rng: () => number = Math.random): GameState {
  const members = initialMembers();
  const artKey = PART_TO_ART[part] ?? "RYO";
  const leader = members.find((m) => m.artKey === artKey)!;
  leader.isLeader = true;
  if (leaderName.trim()) leader.name = leaderName.trim().slice(0, 12);
  // small leader bonus in their part's signature stat
  leader.P = clampStat(leader.P + 4);

  const state: GameState = {
    month: 1,
    rank: "indie",
    stage: 0,
    staff: [],
    items: { metalianD: 2 },
    buffs: { practiceMult: 1, practiceTurns: 0, restFull: false, composeQ95: false, liveSat: 0, liveSellout: false },
    turn: 1,
    turnsPerMonth: TURNS_PER_MONTH,
    hand: [],
    members,
    leaderPart: part,
    support: { mk: 0.2, sn: 0.15 },
    songs: [
      { name: "Iron Dawn", lean: { core: 0.55, light: 0.15, visual: 0.1, expert: 0.2 }, Q: 60, age: 1 },
    ],
    usedSongNames: ["Iron Dawn"],
    practiceFreshness: 80,
    contacts: 0,
    bond: 30,
    friendship: {},
    recent: {},
    evolution: "",
    evoUnlocked: {},
    ...initMarket(),
    funds: 300_000,
    totalFans: 1200,
    segFans: { core: 600, light: 300, visual: 150, expert: 150 },
    fame: 18,
    log: [L("バンド「Metal Road」、活動開始！", "The band \"Metal Road\" begins!")],
  };
  dealHand(state, rng);
  return state;
}

// --- Card catalog -----------------------------------------------------------

const CARD: Record<ActionKind, ActionCard> = {
  rest: {
    kind: "rest",
    subs: [
      { id: "full", label: L("完全休養", "Full Rest"), desc: L("体力を大きく回復", "Restore a lot of stamina") },
      { id: "study", label: L("社会勉強", "Study"), desc: L("体力＋少し ＆ 音楽センス↑", "Stamina + a little & Songcraft up") },
      { id: "hobby", label: L("趣味に没頭", "Hobby"), desc: L("体力＋ ＆ ビジュ力↑", "Stamina + & Looks up") },
    ],
  },
  music: {
    kind: "music",
    subs: [
      { id: "compose", label: L("作曲", "Compose"), desc: L("新曲を書く（知名度維持に必須）", "Write a new song (key to keeping fame up)") },
      { id: "practice", label: L("練習", "Practice"), desc: L("能力UP ＆ 練習の鮮度回復", "Raise abilities & refresh practice freshness") },
      { id: "perform", label: L("パフォーマンス", "Perform"), desc: L("P↑ ＆ 小さくファン獲得", "Performance up & a few new fans") },
    ],
  },
  promo: { kind: "promo" },
  network: {
    kind: "network",
    subs: [
      { id: "band", label: L("バンド関係者", "Bandmates"), desc: L("結束を高め体力回復", "Raise bond & recover stamina") },
      { id: "contact", label: L("新たな人脈", "New Contacts"), desc: L("マーケ力・知名度↑", "Marketing reach & fame up") },
    ],
  },
  money: { kind: "money" },
};

/** Deal a new hand: rest is always offered + 2 random of the rest. During the
 *  hands-on tutorial the hand is forced to the single scripted card. */
export function dealHand(state: GameState, rng: () => number = Math.random): void {
  const ts = tutorialStepFor(state);
  if (ts) {
    state.hand = [CARD[ts.card]];
    return;
  }
  const pool: ActionKind[] = ["music", "promo", "network", "money"];
  // shuffle (Fisher–Yates) and take 2
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const count = 2 + (hasStaff(state, "producer") ? 1 : 0); // a producer widens the hand
  const picks = pool.slice(0, count);
  state.hand = [CARD.rest, ...picks.map((k) => CARD[k])];
}

// --- Action resolution ------------------------------------------------------

const forEachMember = (s: GameState, fn: (m: Member) => void) => s.members.forEach(fn);
const addStamina = (s: GameState, d: number) =>
  forEachMember(s, (m) => (m.stamina = Math.max(0, Math.min(100, m.stamina + d))));
const addParam = (s: GameState, p: Param, d: number) =>
  forEachMember(s, (m) => (m[p] = clampStat(m[p] + d)));

/** Nudge one member's 愛情度 by artKey (clamped 0–100). */
export const addLove = (s: GameState, artKey: string, d: number): void => {
  const m = s.members.find((x) => x.artKey === artKey);
  if (m) m.love = Math.max(0, Math.min(100, m.love + d));
};
/** Average 愛情度 across the band (0–100). */
export const avgLove = (s: GameState): number =>
  s.members.reduce((a, m) => a + m.love, 0) / (s.members.length || 1);

/** A roadie eases the stamina cost of an action. */
const roadieRelief = (s: GameState): number => {
  const r = s.staff.find((x) => x.role === "roadie");
  return r ? 2 + Math.round(4 * (r.intimacy / 100)) : 0;
};
/** Spend stamina for an action (>=2), reduced by any roadie. */
const spend = (s: GameState, base: number) => addStamina(s, -Math.max(2, base - roadieRelief(s)));

/** Spend money (studio fees, materials…), clamped at 0. Returns amount paid. */
const pay = (s: GameState, yen: number): number => {
  const p = Math.min(s.funds, Math.max(0, yen));
  s.funds -= p;
  return p;
};

// Money costs of activities (お金を回す：練習=スタジオ代 / 作曲=録音 / 広報=宣伝費).
const FEE_PRACTICE = 8_000;
const FEE_COMPOSE = 30_000;
const FEE_PROMO = 5_000;

function scene(bg: Scene["bg"], artKeys: string[], text: string, extra: Partial<Scene> = {}): Scene {
  return { bg, chars: artKeys.map((a, i) => ({ member: a, pos: i === 0 ? "center" : i === 1 ? "left" : "right" })), text, ...extra };
}

const leaderArt = (s: GameState) => s.members.find((m) => m.isLeader)?.artKey ?? "RYO";

/**
 * Resolve a played card. `param` is only used for music/practice.
 * Returns the VN scenes to show; state is mutated.
 */
// --- 曲名ストック（客層ごとに1000件を語彙バンクから生成。使用済みは再登場せず）
// 各層の形容詞×名詞の組み合わせでジャンル準拠のタイトルを1000件ずつ用意する
// （全ユニーク）。候補表示は songNameCandidates で毎回4件を無作為抽出。
const SONG_BANK: Record<Segment, { adj: string[]; noun: string[] }> = {
  core: {
    adj: ["Iron", "Steel", "Molten", "Thunder", "Savage", "Brutal", "Raging", "Blazing", "Crushing", "Roaring", "Rusted", "Chrome", "Burning", "Relentless", "Merciless", "Titan", "Diesel", "Voltage", "Furious", "Rampant", "Scorched", "Hammered", "Overdriven", "Unbroken", "Feral", "Rabid", "Nuclear", "Wrecking", "Berserk", "Riotous", "Warbound", "Ironclad", "Turbocharged", "Piston", "Hellbent", "Molten-Hot", "Adrenaline", "Redlined", "Granite", "Rumbling"],
    noun: ["Command", "Legion", "Anthem", "Overdrive", "Hammer", "Onslaught", "Rampage", "Machine", "Engine", "Fury", "Uprising", "Warhead", "Riff", "Havoc", "Stampede", "Colossus", "Juggernaut", "Detonation", "Bulldozer", "Redline", "Warpath", "Assault", "Thunderclap", "Ironworks", "Firestorm", "Sledge", "Warcry", "Overload"],
  },
  light: {
    adj: ["Candy", "Neon", "Sugar", "Glitter", "Bubblegum", "Rainbow", "Sparkle", "Magical", "Cosmic", "Electric", "Sweet", "Cherry", "Starlight", "Pastel", "Hyper", "Kawaii", "Popstar", "Lollipop", "Cotton", "Prism", "Twinkle", "Dreamy", "Sunny", "Fizzy", "Bouncy", "Cheeky", "Peppy", "Dazzling", "Melty", "Poppin", "Fluffy", "Vivid", "Giga", "Turbo", "Ultra", "Mega", "Shiny", "Cutie", "Frosted", "Marshmallow"],
    noun: ["Heartbeat", "Riot", "Apocalypse", "Scream", "Fangs", "Parade", "Distortion", "Panic", "Moshpit", "Explosion", "Chainsaw", "Blast", "Rush", "Fantasy", "Rebellion", "Overload", "Meltdown", "Carnival", "Frenzy", "Uprising", "Anthem", "Bomb", "Storm", "Party", "Revolution", "Circus", "Dynamite", "Fever"],
  },
  visual: {
    adj: ["Velvet", "Crimson", "Gothic", "Obsidian", "Moonlit", "Eternal", "Bleeding", "Silent", "Nocturnal", "Porcelain", "Withered", "Fallen", "Sorrowful", "Pale", "Midnight", "Cursed", "Ivory", "Shrouded", "Mourning", "Lamenting", "Hollow", "Frozen", "Weeping", "Raven", "Dusk", "Vampiric", "Ashen", "Wilting", "Twilight", "Forsaken", "Ebon", "Somber", "Veiled", "Onyx", "Grieving", "Sanguine", "Lunar", "Funereal", "Elegant", "Shattered"],
    noun: ["Requiem", "Lament", "Rose", "Cathedral", "Nocturne", "Elegy", "Sorrow", "Grief", "Lullaby", "Perdition", "Reverie", "Serenade", "Mourning", "Eclipse", "Threnody", "Chalice", "Communion", "Vigil", "Dirge", "Rosary", "Masquerade", "Sonata", "Confession", "Reliquary", "Garden", "Sanctuary", "Descent", "Elegance"],
  },
  expert: {
    adj: ["Fractal", "Polyrhythmic", "Diminished", "Chromatic", "Necrotic", "Guttural", "Spectral", "Dissonant", "Atonal", "Visceral", "Abyssal", "Cryptic", "Fractured", "Warped", "Sundered", "Entropic", "Cadaverous", "Sepulchral", "Malignant", "Putrid", "Cerebral", "Recursive", "Asymmetric", "Convulsive", "Eviscerated", "Morbid", "Grotesque", "Blackened", "Chthonic", "Quantum", "Labyrinthine", "Aberrant", "Serrated", "Baroque", "Infernal", "Unhallowed", "Cavernous", "Perverse", "Obscure", "Vile"],
    noun: ["Abyss", "Doom", "Requiem", "Genesis", "Gospel", "Fugue", "Oblivion", "Sermon", "Carnage", "Leviathan", "Dissonance", "Cascade", "Paradox", "Monolith", "Ossuary", "Cataclysm", "Threshold", "Apparatus", "Vortex", "Aeon", "Epitaph", "Maelstrom", "Charnel", "Effigy", "Continuum", "Meridian", "Sepulcher", "Void"],
  },
};

/** Build a segment's stock of unique titles (adj × noun), capped at 1000. */
function buildSongStock(seg: Segment): string[] {
  const { adj, noun } = SONG_BANK[seg];
  const seen = new Set<string>();
  const out: string[] = [];
  // adj-major so the 1000-cap still spans every noun.
  for (const a of adj) {
    for (const n of noun) {
      const t = `${a} ${n}`;
      if (!seen.has(t)) { seen.add(t); out.push(t); }
      if (out.length >= 1000) return out;
    }
  }
  return out;
}

const SONG_STOCK: Record<Segment, string[]> = {
  core: buildSongStock("core"),
  light: buildSongStock("light"),
  visual: buildSongStock("visual"),
  expert: buildSongStock("expert"),
};

/** `n` unused titles for a segment, drawn at random from its 1000-title stock.
 *  Falls back to a generated title only if the whole stock is exhausted. */
function songNameCandidates(state: GameState, seg: Segment, rng: () => number, n = 4): string[] {
  const used = new Set(state.usedSongNames);
  const avail = SONG_STOCK[seg].filter((x) => !used.has(x));
  // partial Fisher–Yates: only the first n slots need to be randomized.
  const k = Math.min(n, avail.length);
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(rng() * (avail.length - i));
    [avail[i], avail[j]] = [avail[j], avail[i]];
  }
  const out = avail.slice(0, k);
  if (out.length === 0) out.push(`Untitled ${state.songs.length + 1}`);
  return out;
}

export function resolveAction(
  state: GameState,
  kind: ActionKind,
  subId: string | undefined,
  param: Param | undefined,
  rng: () => number = Math.random,
): { scenes: Scene[] } {
  switch (kind) {
    case "rest":
      return resolveRest(state, subId ?? "full", rng);
    case "music":
      return resolveMusic(state, subId ?? "practice", param, rng);
    case "promo":
      return resolvePromo(state, rng);
    case "network":
      return resolveNetwork(state, subId ?? "band", rng);
    case "money":
      return resolveMoney(state, rng);
  }
}

function resolveRest(state: GameState, sub: string, rng: () => number): { scenes: Scene[] } {
  const lead = leaderArt(state);
  if (state.buffs.restFull) {
    // ボインキラー: resting this turn fully restores everyone
    state.members.forEach((m) => (m.stamina = 100));
    state.buffs.restFull = false;
    pushLog(state, L("休息（ボインキラー効果）：体力が全回復した！", "Rest (Boin-Killer): stamina fully restored!"));
    return { scenes: [scene("backstage", [lead], L("妙な高揚感とともに、みなぎる活力。体力が全回復した！\n\n体力 MAX（全員）", "A strange rush of energy surges through you. Stamina fully restored!\n\nStamina MAX (all)"), { fx: "flash" })] };
  }
  if (sub === "study") {
    addStamina(state, 12);
    addParam(state, "S", 1);
    pushLog(state, L("社会勉強：見聞を広げた（体力+12 / センス+1）", "Study: broadened your horizons (Stamina +12 / Songcraft +1)"));
    return { scenes: restScenes("study", L("体力 +12・音楽センス +1（全員）", "Stamina +12 · Songcraft +1 (all)"), rng) };
  }
  if (sub === "hobby") {
    addStamina(state, 26);
    addParam(state, "V", 1);
    pushLog(state, L("趣味に没頭：リフレッシュ（体力+26 / ビジュ+1）", "Hobby time: refreshed (Stamina +26 / Looks +1)"));
    return { scenes: restScenes("hobby", L("体力 +26・ビジュ力 +1（全員）", "Stamina +26 · Looks +1 (all)"), rng) };
  }
  addStamina(state, 40);
  pushLog(state, L("完全休養：しっかり休んだ（体力+40）", "Full rest: a proper break (Stamina +40)"));
  return { scenes: restScenes("full", L("体力 +40（全員）", "Stamina +40 (all)"), rng) };
}

function resolveMusic(
  state: GameState,
  sub: string,
  param: Param | undefined,
  rng: () => number,
): { scenes: Scene[] } {
  if (sub === "compose") {
    const s = bandParam(state.members, "S");
    const producer = state.staff.find((x) => x.role === "producer");
    const pQ = producer ? 10 * (producer.intimacy / 100) : 0; // producer lifts quality
    let Q = Math.max(20, Math.min(95, Math.round(0.7 * s + rng() * 20 + pQ)));
    if (state.buffs.composeQ95) {
      Q = 95;
      state.buffs.composeQ95 = false;
    }
    spend(state, 14);
    pay(state, FEE_COMPOSE); // 録音・スタジオ代でお金がガクッと減る
    pushLog(state, L(`作曲：スタジオを押さえた（録音費 ${yen(FEE_COMPOSE)}）`, `Compose: booked the studio (recording fee ${yen(FEE_COMPOSE)})`));
    const lead = state.members.find((m) => m.isLeader)?.artKey ?? "RYO";
    // 楽曲属性: Step 1 — aim the song at a segment (its lean); Step 2 — pick a
    // title from segment-flavored candidates (used titles are never re-offered).
    const dirChoice = (seg: Segment): SceneChoice => {
      const nameChoices: SceneChoice[] = songNameCandidates(state, seg, rng).map((nm) => ({
        label: L(`「${nm}」`, `"${nm}"`),
        apply: (st) => {
          st.usedSongNames.push(nm);
          st.songs.push({ name: nm, lean: leanToward(seg), Q, age: 0 });
          pushLog(st, L(`作曲：「${nm}」完成（Q${Q}／${segLabel(seg)}寄り）`, `Wrote "${nm}" (Q${Q} / ${segLabel(seg)}-leaning)`));
        },
        next: composeScenes(nm, Q, rng),
      }));
      return {
        label: L(`${segLabel(seg)}寄り`, `${segLabel(seg)}-leaning`),
        next: [
          {
            bg: "studio",
            chars: [{ member: lead, pos: "center", mood: "normal" }],
            text: L(`${segLabel(seg)}層に刺す一曲（Q${Q}）。タイトルはどれにする？`, `A track aimed at ${segLabel(seg)} fans (Q${Q}). Which title?`),
            choices: nameChoices,
          },
        ],
      };
    };
    return {
      scenes: [
        {
          bg: "studio",
          chars: [{ member: lead, pos: "center", mood: "normal" }],
          text: L(`スタジオで新曲を録る（録音費 ${yen(FEE_COMPOSE)}）。曲は形になってきた（Q${Q}）——どの客層に刺す一曲に仕上げる？`, `Recording a new song at the studio (recording fee ${yen(FEE_COMPOSE)}). It's taking shape (Q${Q}) — which audience should it target?`),
          choices: SEGMENTS.map(dirChoice),
        },
      ],
    };
  }
  if (sub === "perform") {
    addParam(state, "P", 2);
    const f = 24 + Math.floor(rng() * 24); // 24–47 fans
    const c = Math.round(f * 0.4);
    state.segFans.light += f;
    state.segFans.core += c;
    state.totalFans += f + c;
    state.fame = Math.min(100, state.fame + 1);
    spend(state, 14);
    pushLog(state, L(`パフォーマンス特訓：ステージ度胸UP（P+2 / ファン+${f + c}）`, `Performance drill: stage presence up (P+2 / Fans +${f + c})`));
    return { scenes: performScenes(L(`パフォーマンス +2・ファン +${f + c}`, `Performance +2 · Fans +${f + c}`), rng) };
  }
  // practice — needs a param; item buffs multiply the gain
  const p = param ?? "T";
  const gain = Math.round(6 * state.buffs.practiceMult);
  addParam(state, p, gain);
  spend(state, 16);
  pay(state, FEE_PRACTICE); // スタジオ代
  state.practiceFreshness = 100;
  pushLog(state, L(`練習：${paramLabel(p)}を強化（+${gain} / 全員）・スタジオ代 ${yen(FEE_PRACTICE)}・鮮度MAX`, `Practice: ${paramLabel(p)} up (+${gain} / all) · studio ${yen(FEE_PRACTICE)} · freshness MAX`));
  const scenes = practiceScenes(p, gain, rng);
  // Sometimes a bandmate turns to the leader mid-session for a word (choice event).
  if (rng() < 0.5) scenes.splice(2, 0, ...practiceTalk(state, rng));
  return { scenes };
}

function resolvePromo(state: GameState, rng: () => number): { scenes: Scene[] } {
  state.fame = Math.min(100, state.fame + 3);
  state.support.sn = Math.min(1, state.support.sn + 0.03);
  const f = 14 + Math.floor(state.fame / 4);
  const c = Math.round(f * 0.3);
  state.segFans.light += f;
  state.segFans.core += c;
  state.totalFans += f + c;
  spend(state, 10);
  pay(state, FEE_PROMO); // フライヤー・広告費
  pushLog(state, L(`広報活動：SNS・宣伝を強化（知名度+3 / ファン+${f + c} / 宣伝費 ${yen(FEE_PROMO)}）`, `Promotion: SNS & ads (Fame +3 / Fans +${f + c} / ad cost ${yen(FEE_PROMO)})`));
  return { scenes: promoScenes(L(`知名度 +3・SNS効果UP・ファン +${f + c}（宣伝費 ${yen(FEE_PROMO)}）`, `Fame +3 · SNS boost · Fans +${f + c} (ad cost ${yen(FEE_PROMO)})`), rng) };
}

function resolveNetwork(state: GameState, sub: string, rng: () => number): { scenes: Scene[] } {
  if (sub === "contact") {
    state.contacts += 1;
    state.support.mk = Math.min(1, state.support.mk + 0.03);
    state.fame = Math.min(100, state.fame + 1);
    spend(state, 10);
    pushLog(state, L(`新たな人脈：業界の知り合いが増えた（人脈+1 → ${state.contacts} / マーケ力・知名度↑）`, `New contacts: another industry connection (Contacts +1 → ${state.contacts} / marketing & fame up)`));
    return { scenes: contactScenes(L(`人脈 +1（計${state.contacts}）・マーケ力UP・知名度 +1`, `Contacts +1 (total ${state.contacts}) · marketing up · Fame +1`), rng) };
  }
  // Time with the crew warms up any hired staff (親密度) no matter what's said;
  // the heart-to-heart itself is an interactive talk (結束/愛情度 vary by reply).
  for (const st of state.staff) st.intimacy = Math.min(100, st.intimacy + 8);
  return { scenes: bondTalkScenes(state, rng) };
}

// --- Interactive member events (発言選択 + 愛情度) --------------------------

type Mood = "normal" | "fired" | "happy" | "sad";

/** One reply option: its effects and how the featured member reacts. */
interface Reply {
  label: string; // the leader's line (button text)
  love: number; // Δ愛情度 for the featured member
  bond?: number; // Δ結束 (band-wide)
  stam?: number; // Δ体力 (all members)
  funds?: number; // Δ資金
  stat?: { p: Param; d: number }; // small Δ to one skill (all members)
  react: string; // the member's reaction line
  mood: Mood;
}
interface Topic {
  line: string; // what the member opens with
  replies: Reply[];
}

const nonLeaders = (s: GameState): Member[] => s.members.filter((m) => !m.isLeader);
const sign = (n: number): string => (n >= 0 ? `+${n}` : `${n}`);

/** Build a 1-scene prompt + branching reactions for a member talk. */
function buildTalk(m: Member, topic: Topic, bg: BgKey): Scene[] {
  const choices = topic.replies.map((r) => {
    const bits: string[] = [L(`${m.name}の愛情度${sign(r.love)}`, `${m.name} affection ${sign(r.love)}`)];
    if (r.bond) bits.push(L(`結束${sign(r.bond)}`, `unity ${sign(r.bond)}`));
    if (r.stam) bits.push(L(`体力${sign(r.stam)}`, `stamina ${sign(r.stam)}`));
    if (r.funds) bits.push(L(`資金${sign(r.funds)}`, `funds ${sign(r.funds)}`));
    if (r.stat) bits.push(`${paramLabel(r.stat.p)}${sign(r.stat.d)}`);
    const summary = bits.join(L("・", ", "));
    return {
      label: r.label,
      apply: (s: GameState) => {
        addLove(s, m.artKey, r.love);
        if (r.bond) s.bond = Math.max(0, Math.min(100, s.bond + r.bond));
        if (r.stam) addStamina(s, r.stam);
        if (r.funds) s.funds += r.funds;
        if (r.stat) addParam(s, r.stat.p, r.stat.d);
        pushLog(s, L(`${m.name}と語らった：${summary}`, `Talked with ${m.name}: ${summary}`));
      },
      next: [
        {
          bg,
          chars: [{ member: m.artKey, pos: "center" as const, mood: r.mood }],
          speaker: m.name,
          text: L(`${r.react}\n\n（${summary}）`, `${r.react}\n\n(${summary})`),
          fx: (r.love > 0 ? "flash" : undefined) as Scene["fx"],
        },
      ],
    };
  });
  return [
    {
      bg,
      chars: [{ member: m.artKey, pos: "center" as const, mood: "normal" }],
      speaker: m.name,
      text: topic.line,
      choices,
    },
  ];
}

/** 交流（バンド関係者）：a random bandmate opens up; the reply shapes 結束/愛情度. */
const BOND_TOPICS: Topic[] = [
  {
    line: L("「なあ、最近ちゃんと前に進めてるのかな……ふと不安になる時があってさ」", "\"Hey... are we actually getting anywhere lately? Sometimes I just get this uneasy feeling.\""),
    replies: [
      { label: L("「大丈夫、ちゃんと進んでる。俺が保証する」", "\"We're good. We're moving forward — I guarantee it.\""), love: 9, bond: 8, mood: "happy", react: L("「……そっか。あんたがそう言うなら、信じられるよ」", "\"...Yeah. If you say so, I can believe it.\"") },
      { label: L("「不安なら練習で埋めろ。手を動かせ」", "\"Anxious? Drown it in practice. Keep your hands moving.\""), love: 2, bond: 10, stam: -4, mood: "fired", react: L("「……くっ、違いない。やってやるよ！」", "\"...Heh, can't argue with that. Let's do this!\"") },
      { label: L("「わかる。俺も同じだよ」と弱音を共有", "\"I get it. I feel the same way\" — sharing the doubt"), love: 6, bond: 6, mood: "normal", react: L("「なんだ、あんたもか。ちょっと安心した」", "\"Huh, you too? That's kind of a relief.\"") },
    ],
  },
  {
    line: L("「ねえ、今夜このあと軽く飲みに行かない？ たまには馬鹿な話がしたい」", "\"Hey, wanna grab a drink after this? I could use some dumb small talk for once.\""),
    replies: [
      { label: L("「いいね、行こう。今日は付き合うよ」", "\"Sounds good, let's go. I'm with you tonight.\""), love: 8, bond: 9, stam: 6, mood: "happy", react: L("「よっしゃ！ こういう時間が一番効くんだって」", "\"Yes! Nights like this are the best medicine.\"") },
      { label: L("「悪い、今日は曲作りたい」", "\"Sorry, I want to write tonight.\""), love: -3, bond: 4, mood: "sad", react: L("「……はいはい、真面目だこと。まあ、無理すんなよ」", "\"...Yeah yeah, always so serious. Don't overdo it, though.\"") },
      { label: L("「一杯だけな」と付き合う", "\"Just one, okay?\" — tagging along"), love: 5, bond: 7, mood: "normal", react: L("「一杯って言うやつに限って朝までなんだよなあ」", "\"The 'just one' people are always the ones who go till dawn.\"") },
    ],
  },
  {
    line: L("「正直さ、あんたがリーダーで良かったって思ってる。……柄じゃないけど、言っときたくて」", "\"Honestly, I'm glad you're our leader. ...Not like me to say it, but I wanted you to know.\""),
    replies: [
      { label: L("「……ありがとう。お前がいるからだよ」", "\"...Thanks. It's because you're here.\""), love: 12, bond: 8, mood: "happy", react: L("「うわ、照れるからやめろって！ ……でも、うん」", "\"Ugh, quit it, you're embarrassing me! ...But, yeah.\"") },
      { label: L("「当たり前だろ、ついてこい」", "\"Obviously. Now follow me.\""), love: 4, bond: 9, mood: "fired", react: L("「ははっ、その強気、嫌いじゃないよ」", "\"Ha! That swagger — I don't hate it.\"") },
      { label: L("「急にどうした、気持ち悪いな」と茶化す", "\"What's gotten into you? Creepy.\" — brushing it off"), love: -2, bond: 5, mood: "sad", react: L("「……せっかく良いこと言ったのに。もう知らね」", "\"...I finally say something nice and this is what I get. Forget it.\"") },
    ],
  },
];

/** Return an interactive bond talk with a random bandmate. */
export function bondTalkScenes(state: GameState, rng: () => number = Math.random): Scene[] {
  const m = pick(rng, nonLeaders(state));
  return buildTalk(m, pick(rng, BOND_TOPICS), "backstage");
}

/** 練習中の発言選択：per-member topics (personality-specific). */
const PRACTICE_TOPICS_BY_MEMBER: Record<string, Topic[]> = {
  RYO: [ // RISA — cocky frontwoman lion
    {
      line: L("「ねえ、あたしのシャウト……今日、いつもよりキレてない？ ちゃんと見てた？」", "\"Hey, my scream today — sharper than usual, right? You were watching, weren't you?\""),
      replies: [
        { label: L("「見てた。鳥肌立った、マジで」", "\"I was. Gave me goosebumps, seriously.\""), love: 6, stat: { p: "P", d: 1 }, mood: "happy", react: L("「でしょ！？ ふふ、あんたに褒められると悪くないね」", "\"Right!? Heh, not bad getting praise from you.\"") },
        { label: L("「あと一歩。喉の開き方、詰めよう」", "\"Almost there. Let's work on how you open your throat.\""), love: 3, stat: { p: "V", d: 1 }, stam: -2, mood: "fired", react: L("「……上等。あたしの限界、まだ先にあるってことね」", "\"...Bring it. So my limit's still further out there.\"") },
        { label: L("「うーん、いつも通りじゃない？」", "\"Hmm, same as always, no?\""), love: -4, mood: "sad", react: L("「はぁ！？ ……今の、後悔するからね」", "\"Excuse me!? ...You're gonna regret that.\"") },
      ],
    },
    {
      line: L("「新しい衣装、攻めすぎかな？ ……あんたはどう思う？」", "\"Is the new outfit too much? ...What do you think?\""),
      replies: [
        { label: L("「最高。誰よりお前が目立つ」", "\"It's perfect. You'll outshine everyone.\""), love: 7, stat: { p: "V", d: 1 }, mood: "happy", react: L("「ん、決まりね。ステージ、燃やしてやる」", "\"Settled, then. I'll set the stage on fire.\"") },
        { label: L("「動きやすさも考えような」", "\"Let's think about mobility too.\""), love: 3, mood: "normal", react: L("「……たしかに。暴れられなきゃ意味ないもんね」", "\"...Fair. No point if I can't go wild in it.\"") },
        { label: L("「派手すぎない？」", "\"Isn't it a bit flashy?\""), love: -3, mood: "sad", react: L("「あたしに地味でいろって？ ありえない」", "\"You want me to play it plain? Not happening.\"") },
      ],
    },
  ],
  KEN: [ // NAO — stoic shredder bird
    {
      line: L("「このリフ、まだ甘い気がする。……お前ならどう組む？」", "\"This riff still feels weak to me. ...How would you build it?\""),
      replies: [
        { label: L("「今ので完成してる。信じろ」", "\"It's already finished. Trust it.\""), love: 6, stat: { p: "S", d: 1 }, mood: "happy", react: L("「……そうか。お前が言うなら、これでいく」", "\"...I see. If you say so, we go with this.\"") },
        { label: L("「もっと邪悪にできる。詰めよう」", "\"We can make it nastier. Let's push it.\""), love: 4, stat: { p: "T", d: 1 }, stam: -3, mood: "fired", react: L("「……っ、やっぱそう来るか。よし、朝までやるぞ」", "\"...Heh, figured you'd say that. Fine, we're at it till dawn.\"") },
        { label: L("「考えすぎ。手癖で弾け」", "\"Overthinking it. Just play on instinct.\""), love: -3, mood: "sad", react: L("「……お前に聞いた俺が馬鹿だった」", "\"...Stupid of me to even ask you.\"") },
      ],
    },
    {
      line: L("「指、ついてこなくなってきた……少し落とすか？」", "\"My fingers are starting to lag... should we ease off a bit?\""),
      replies: [
        { label: L("「休め。壊したら元も子もない」", "\"Rest. No point if you break your hands.\""), love: 6, stam: 6, mood: "happy", react: L("「……悪いな。少し、休ませてもらう」", "\"...Sorry. I'll take a short rest.\"") },
        { label: L("「限界の先に、答えがある」", "\"The answer's just past your limit.\""), love: 3, stat: { p: "T", d: 1 }, stam: -3, mood: "fired", react: L("「……ふっ、鬼だな。嫌いじゃない」", "\"...Heh, you're merciless. I don't hate it.\"") },
        { label: L("「気合が足りないだけだろ」", "\"You just lack drive, that's all.\""), love: -4, mood: "sad", react: L("「……そういうことを言う奴だったか」", "\"...So that's the kind of guy you are.\"") },
      ],
    },
  ],
  MIO: [ // MAKO — cool, quiet frog
    {
      line: L("「……ベースライン、埋もれてない？ 正直に言って」", "\"...Is my bassline getting buried? Be honest.\""),
      replies: [
        { label: L("「土台として完璧に効いてる」", "\"It's holding the whole foundation perfectly.\""), love: 6, stat: { p: "T", d: 1 }, mood: "happy", react: L("「……よかった。ちゃんと、聴いてくれてるんだ」", "\"...Good. You really are listening.\"") },
        { label: L("「もう少し前に出ていい」", "\"You can push out front a little more.\""), love: 4, stat: { p: "S", d: 1 }, stam: -2, mood: "fired", react: L("「ん。……じゃあ、少しだけ、暴れる」", "\"Mm. ...Then I'll cut loose, just a little.\"") },
        { label: L("「ベースって聴こえてた？」", "\"Wait, could you even hear the bass?\""), love: -4, mood: "sad", react: L("「……最低。もう聞かない」", "\"...The worst. I'm not asking again.\"") },
      ],
    },
    {
      line: L("「（無言でこっちを見て、ふっと小さく笑った）……なに？」", "\"(She looks over silently, then lets out a small smile) ...What?\""),
      replies: [
        { label: L("「いや、良い音出すなと思って」", "\"Nothing, just thinking you make a great sound.\""), love: 7, mood: "happy", react: L("「……ふふ。あなたも、悪くない」", "\"...Heh. You're not so bad yourself.\"") },
        { label: L("「集中しよう」と練習に戻す", "\"Let's focus\" — back to practice"), love: 2, stat: { p: "S", d: 1 }, mood: "normal", react: L("「ん。……そうだね。続けよ」", "\"Mm. ...You're right. Let's keep going.\"") },
        { label: L("「にやけてて気持ち悪い」", "\"That grin's creepy.\""), love: -4, mood: "sad", react: L("「……ひどい。もう笑わない」", "\"...Rude. I won't smile anymore.\"") },
      ],
    },
  ],
  GO: [ // TOMO — energetic rabbit drummer
    {
      line: L("「ねえねえ、今のフィルどうだった！？ 新しいの入れてみたの！」", "\"Hey hey, how was that fill!? I tried out a new one!\""),
      replies: [
        { label: L("「めっちゃ良かった！ 攻めてる！」", "\"So good! Super aggressive!\""), love: 7, stat: { p: "P", d: 1 }, mood: "happy", react: L("「やった〜！ もっと変なの入れちゃうもんね！」", "\"Yay~! I'm gonna throw in even weirder ones!\"") },
        { label: L("「良いけど、走り気味かも」", "\"Nice, but you're rushing a touch.\""), love: 4, stat: { p: "T", d: 1 }, stam: -2, mood: "fired", react: L("「うっ……で、でも直す！ もう一回！」", "\"Ngh... b-but I'll fix it! One more time!\"") },
        { label: L("「普通じゃない？」", "\"Isn't that kinda normal?\""), love: -4, mood: "sad", react: L("「えぇ〜っ、そんなぁ……ちぇっ」", "\"Whaat, come on... tch.\"") },
      ],
    },
    {
      line: L("「手、めっちゃパンパン……でもまだ叩けるよ！ どうする？」", "\"My hands are so puffy... but I can still play! What do we do?\""),
      replies: [
        { label: L("「無理すんな。休憩しよう」", "\"Don't push it. Let's take a break.\""), love: 6, stam: 6, mood: "happy", react: L("「えへへ、優しい〜。じゃあ、ちょっとだけ休も！」", "\"Ehehe, so sweet~. Okay, let's rest just a little!\"") },
        { label: L("「その意気だ、もう一曲！」", "\"That's the spirit — one more song!\""), love: 4, stat: { p: "P", d: 1 }, stam: -3, mood: "fired", react: L("「いっくよ〜！ ドコドコドコッ!!」", "\"Heeere we go~! Boom-boom-boom!!\"") },
        { label: L("「根性がないなあ」", "\"You've got no guts.\""), love: -4, mood: "sad", react: L("「ひどっ！ あたし、こんなに頑張ってるのに〜っ」", "\"So mean! I'm trying so hard here~!\"") },
      ],
    },
  ],
};

/** An in-practice reply moment: a random bandmate raises their own topic. */
export function practiceTalk(state: GameState, rng: () => number = Math.random): Scene[] {
  const m = pick(rng, nonLeaders(state));
  const topics = PRACTICE_TOPICS_BY_MEMBER[m.artKey];
  if (!topics || topics.length === 0) return [];
  return buildTalk(m, pick(rng, topics), "studio");
}

/** Standalone “member moment” events, keyed to a member's personality. */
interface MemberEvent extends Topic {
  art: string;
  bg: BgKey;
}
const MEMBER_EVENTS: MemberEvent[] = [
  {
    art: "KEN", // NAO — stoic shredder
    bg: "studio",
    line: L("「このリフ、どうしても納得いかない。……なあ、正直どう思う？」", "\"I just can't get this riff right. ...Hey, honestly, what do you think?\""),
    replies: [
      { label: L("「めちゃくちゃ良い。自信持て」", "\"It's killer. Have some confidence.\""), love: 8, stat: { p: "S", d: 1 }, mood: "happy", react: L("「……そうか。あんたがそう言うなら、これでいく」", "\"...I see. If you say so, we go with this.\"") },
      { label: L("「まだ甘い。一緒に詰めよう」", "\"Still soft. Let's tighten it together.\""), love: 5, stat: { p: "T", d: 1 }, stam: -3, mood: "fired", react: L("「……っ、やっぱそう思うよな。よし、朝までやるぞ」", "\"...Heh, knew you'd feel the same. Right, we're at it till dawn.\"") },
      { label: L("「考えすぎ。手癖で弾け」", "\"Overthinking it. Just play on instinct.\""), love: -2, mood: "sad", react: L("「……お前に聞いた俺が馬鹿だった」", "\"...Stupid of me to even ask you.\"") },
    ],
  },
  {
    art: "GO", // TOMO — bouncy drummer
    bg: "street",
    line: L("「ねえねえ！ 次のライブ、ドラムソロで新技ぶっこんでいい！？ めっちゃ練習したの！」", "\"Hey hey! Can I drop a new trick in the drum solo next show!? I practiced tons!\""),
    replies: [
      { label: L("「最高じゃん、やっちゃえ！」", "\"That's awesome, go for it!\""), love: 9, stat: { p: "P", d: 1 }, mood: "happy", react: L("「やった〜！ 絶対ウケさせるからね、見てて！」", "\"Yay~! I'll totally bring the house down, watch me!\"") },
      { label: L("「いいけど、失敗すんなよ？」", "\"Sure, but don't blow it, okay?\""), love: 4, mood: "normal", react: L("「うっ……で、でも大丈夫！ たぶん！」", "\"Ngh... b-but I'll be fine! Probably!\"") },
      { label: L("「まだ早い。基礎を固めろ」", "\"Too soon. Nail the basics first.\""), love: -3, stat: { p: "T", d: 1 }, mood: "sad", react: L("「……はーい。ちぇっ、分かってるってば」", "\"...Fiiine. Tch, I know already.\"") },
    ],
  },
  {
    art: "MIO", // MAKO — cool, quiet worrier
    bg: "backstage",
    line: L("「……お金、足りてる？ わたし、バイト増やそうか」", "\"...Are we okay on money? Maybe I should pick up more shifts.\""),
    replies: [
      { label: L("「気にすんな。ここは俺が持つ」", "\"Don't worry about it. I've got this one.\""), love: 8, funds: -20_000, mood: "happy", react: L("「……そう。じゃあ、甘えとく。ありがと」", "\"...Okay. Then I'll lean on you. Thanks.\"") },
      { label: L("「助かる。頼めるか？」", "\"That'd help. Can I count on you?\""), love: 5, funds: 30_000, stam: -4, mood: "normal", react: L("「ん。……たまには頼ってくれて、嬉しい」", "\"Mm. ...Nice to be relied on once in a while.\"") },
      { label: L("「金の心配より練習しろ」", "\"Forget the money, just practice.\""), love: -3, mood: "sad", react: L("「……そうだね。余計なこと言った」", "\"...You're right. Forget I said anything.\"") },
    ],
  },
  {
    art: "RYO", // RISA — cocky frontwoman
    bg: "studio",
    line: L("「ねえ、あたしのステージング、ちゃんと『ヤバい』って言える？ 忖度なしで」", "\"Hey, can you honestly call my stage presence 'insane'? No sugarcoating.\""),
    replies: [
      { label: L("「ヤバい。会場全部持ってける」", "\"Insane. You could own the whole venue.\""), love: 9, stat: { p: "V", d: 1 }, mood: "happy", react: L("「でしょ！？ ……ふふ、あんたに言われると悪くないね」", "\"Right!? ...Heh, coming from you, that's not bad.\"") },
      { label: L("「まだ伸びる。もっと化けろ」", "\"You've got more in you. Transform harder.\""), love: 4, stat: { p: "P", d: 1 }, stam: -3, mood: "fired", react: L("「上等。あたしの限界、見せてやる」", "\"Bring it. I'll show you my limit.\"") },
      { label: L("「普通じゃない？」と流す", "\"Isn't it kinda average?\" — brushing it off"), love: -4, mood: "sad", react: L("「……は？ 今の発言、後悔するよあんた」", "\"...Huh? You're gonna regret saying that.\"") },
    ],
  },
];

/** ~28% at the start of a turn: a bandmate pulls the leader aside (choice event). */
export function maybeMemberEvent(state: GameState, rng: () => number = Math.random): Scene[] | null {
  if (rng() >= 0.28) return null;
  const leaderKey = state.members.find((m) => m.isLeader)?.artKey;
  const pool = MEMBER_EVENTS.filter((e) => e.art !== leaderKey && state.members.some((m) => m.artKey === e.art));
  if (pool.length === 0) return null;
  const e = pick(rng, pool);
  const m = state.members.find((mm) => mm.artKey === e.art)!;
  return buildTalk(m, { line: e.line, replies: e.replies }, e.bg);
}

// --- 友情イベント（愛情度が一定に達すると発火・1回きり）---------------------

/** 愛情度がこの値以上になったメンバーと、特別な友情イベントが起きる。 */
export const FRIENDSHIP_THRESHOLD = 70;

/** Per-member friendship payoff: a heartfelt scene + a permanent boon. */
interface Friendship {
  bg: BgKey;
  line: string; // the member's heartfelt line
  boon: string; // human-readable reward
  apply: (s: GameState) => void; // the permanent effect
}
const FRIENDSHIPS: Record<string, Friendship> = {
  RYO: {
    bg: "backstage",
    line: L("「あたしさ、あんたとバンド組めて本気で良かったと思ってる。……一生ついてく。だからさ、絶対てっぺん獲るよ」", "\"I honestly mean it — I'm so glad I'm in a band with you. ...I'm with you for life. So let's take the top, no matter what.\""),
    boon: L("RISAとの絆が深まった：パフォーマンス+6（永続）", "Your bond with RISA deepened: Performance +6 (permanent)"),
    apply: (s) => { const m = s.members.find((x) => x.artKey === "RYO"); if (m) m.P = clampStat(m.P + 6); },
  },
  KEN: {
    bg: "studio",
    line: L("「……柄じゃないけど言わせてくれ。お前の音楽を信じてる。俺のギター、全部お前に預ける」", "\"...Not like me to say it, but let me. I believe in your music. My guitar — it's all yours.\""),
    boon: L("NAOとの絆が深まった：演奏基礎+6（永続）", "Your bond with NAO deepened: Musicianship +6 (permanent)"),
    apply: (s) => { const m = s.members.find((x) => x.artKey === "KEN"); if (m) m.T = clampStat(m.T + 6); },
  },
  MIO: {
    bg: "backstage",
    line: L("「わたし、あんまり喋らないけど……ちゃんと見てる。あなたの隣が、いちばん落ち着く。ずっと弾かせて」", "\"I don't talk much, but... I'm always watching. Next to you is where I'm calmest. Let me keep playing here forever.\""),
    boon: L("MAKOとの絆が深まった：音楽センス+6（永続）", "Your bond with MAKO deepened: Songcraft +6 (permanent)"),
    apply: (s) => { const m = s.members.find((x) => x.artKey === "MIO"); if (m) m.S = clampStat(m.S + 6); },
  },
  GO: {
    bg: "street",
    line: L("「あたしね、このバンドが世界でいちばん好き！ みんなと叩いてると無敵になれるの。ずーっと一緒だよ！」", "\"You know what? I love this band more than anything in the world! When I'm drumming with everyone I feel unstoppable. We're together foreveeer!\""),
    boon: L("TOMOとの絆が深まった：ビジュ力+6（永続）", "Your bond with TOMO deepened: Looks +6 (permanent)"),
    apply: (s) => { const m = s.members.find((x) => x.artKey === "GO"); if (m) m.V = clampStat(m.V + 6); },
  },
};

/** If any bandmate has crossed the affection threshold, fire their (one-time)
 *  friendship event: a special scene + a permanent boon. Marks it done. */
export function pendingFriendshipScenes(state: GameState): Scene[] | null {
  const m = state.members.find(
    (x) => !x.isLeader && x.love >= FRIENDSHIP_THRESHOLD && !state.friendship[x.artKey] && FRIENDSHIPS[x.artKey],
  );
  if (!m) return null;
  const f = FRIENDSHIPS[m.artKey];
  state.friendship[m.artKey] = true;
  f.apply(state);
  state.bond = Math.min(100, state.bond + 6);
  pushLog(state, L(`💞 友情イベント：${m.name}との絆が深まった！（${f.boon}・結束+6）`, `💞 Friendship event: your bond with ${m.name} deepened! (${f.boon} / unity +6)`));
  return [
    { bg: f.bg, chars: [{ member: m.artKey, pos: "center", mood: "happy" }], speaker: m.name, text: f.line, fx: "flash" },
    {
      bg: f.bg,
      chars: [{ member: m.artKey, pos: "center", mood: "fired" }],
      text: L(`💞 ${m.name}との友情が深まった——！\n\n${f.boon}\n結束 +6`, `💞 Your friendship with ${m.name} deepened——!\n\n${f.boon}\nUnity +6`),
      fx: "flash",
    },
  ];
}

/** The event to show at the start of a turn: friendship (priority) or a moment. */
export function nextTurnEvent(state: GameState, rng: () => number = Math.random): Scene[] | null {
  if (tutorialActive(state)) return null; // keep the scripted run-up clean
  return pendingFriendshipScenes(state) ?? maybeMemberEvent(state, rng);
}

// --- ライブ中のMC/パフォーマンス選択（出来栄えが少し変わる）-----------------

/** Pre-show beats: huddle + two in-the-moment choices that nudge the live. The
 *  choices bank satisfaction into buffs.liveSat, consumed by resolveLive. */
/** Pick an index in [0,len) that isn't the same as last time for `key` (avoids
 *  back-to-back repeats so recurring events stay fresh). */
function pickIdxNoRepeat(state: GameState, key: string, len: number, rng: () => number): number {
  const last = state.recent[key];
  let i = Math.floor(rng() * len);
  if (len > 1 && i === last) i = (i + 1 + Math.floor(rng() * (len - 1))) % len;
  state.recent[key] = i;
  return i;
}

/** One MC option: its line, which layers it flatters, base satisfaction, effect. */
interface McOption { label: string; favored: Segment[]; base: number; extra?: (s: GameState) => void; note?: string }

/** 5 opening-MC scripts (第一声). Picked with no back-to-back repeats. */
const LIVE_MC_SCRIPTS: McOption[][] = [
  [
    { label: L("「準備はいいかァ——ッ!? 声、聞かせろォ!!」", "\"You ready——!? Let me hear you SCREAM!!\""), favored: ["core", "light"], base: 3 },
    { label: L("「俺たちがMetal Roadだ！ 名前、刻んで帰れ！」", "\"We're Metal Road! Carve the name in and take it home!\""), favored: ["light", "visual"], base: 3, note: L("・知名度+1", " / fame +1"), extra: (s) => { s.fame = Math.min(100, s.fame + 1); } },
    { label: L("「……来てくれてありがとう。全部込める」", "\"...Thanks for coming. We'll pour everything in.\""), favored: ["expert", "core"], base: 3, note: L("・結束+4", " / unity +4"), extra: (s) => { s.bond = Math.min(100, s.bond + 4); } },
  ],
  [
    { label: L("「今夜、暴れる覚悟はできてるかァ!?」", "\"You ready to go wild tonight!?\""), favored: ["core", "light"], base: 3 },
    { label: L("「初めての奴も常連も、まとめて持ってく！」", "\"First-timers, regulars — we're taking all of you!\""), favored: ["light", "visual"], base: 3, note: L("・知名度+1", " / fame +1"), extra: (s) => { s.fame = Math.min(100, s.fame + 1); } },
    { label: L("「今の俺たちの音、その目に焼きつけろ」", "\"Our sound, right now — burn it into your eyes.\""), favored: ["expert", "visual"], base: 3 },
  ],
  [
    { label: L("「声、限界まで出していけェ——!!」", "\"Push your voices to the limit——!!\""), favored: ["core", "light"], base: 3 },
    { label: L("「ようこそ、俺たちの世界へ」", "\"Welcome to our world.\""), favored: ["visual", "light"], base: 3, note: L("・知名度+1", " / fame +1"), extra: (s) => { s.fame = Math.min(100, s.fame + 1); } },
    { label: L("「難しい話は抜きだ。ぶちかますぞ」", "\"No fancy talk. Let's blow the roof off.\""), favored: ["core", "expert"], base: 3 },
  ],
  [
    { label: L("「ヘドバンの準備、いいなァ!?」", "\"Ready to headbang!?\""), favored: ["core", "light"], base: 3 },
    { label: L("「今日を一生忘れられない夜にする」", "\"We're making tonight a night you'll never forget.\""), favored: ["visual", "expert"], base: 3, note: L("・結束+3", " / unity +3"), extra: (s) => { s.bond = Math.min(100, s.bond + 3); } },
    { label: L("「ここからは無礼講だ。全部出せ！」", "\"No rules from here on. Give it everything!\""), favored: ["core", "light"], base: 3 },
  ],
  [
    { label: L("「叫びたい奴、全員かかってこい!!」", "\"Anyone who wants to scream — bring it on, all of you!!\""), favored: ["core", "light"], base: 3 },
    { label: L("「見せてやる、これがメタルロードだ」", "\"We'll show you — this is Metal Road.\""), favored: ["light", "visual"], base: 3, note: L("・知名度+1", " / fame +1"), extra: (s) => { s.fame = Math.min(100, s.fame + 1); } },
    { label: L("「静かに始めよう……嵐の前の、な」", "\"Let's start quiet... the calm before the storm.\""), favored: ["expert", "visual"], base: 3 },
  ],
];

/** 5 encore-MC scripts (間奏〜アンコールの煽り). Picked with no repeats. */
const LIVE_ENCORE_MC_SCRIPTS: McOption[][] = [
  [
    { label: L("「もう一曲——付き合えるかァ!?」", "\"One more song——you still with us!?\""), favored: ["core", "light"], base: 3 },
    { label: L("「最後まで声、枯らしていけ!!」", "\"Scream till your voices give out!!\""), favored: ["core", "light"], base: 3 },
    { label: L("「この余韻、忘れんなよ」", "\"Don't forget this afterglow.\""), favored: ["expert", "visual"], base: 3 },
  ],
  [
    { label: L("「まだ帰さねえぞ、覚悟しろ!!」", "\"We're not letting you leave yet — brace yourselves!!\""), favored: ["core", "light"], base: 3 },
    { label: L("「みんなで最高のラスト、作ろう」", "\"Let's build the best finale together.\""), favored: ["light", "visual"], base: 3 },
    { label: L("「耳、澄ませてろ——本気の一発だ」", "\"Ears open——here comes the real one.\""), favored: ["expert", "core"], base: 3 },
  ],
  [
    { label: L("「アンコールありがとう！ ブチかますぞ!!」", "\"Thanks for the encore! Let's tear it up!!\""), favored: ["core", "light"], base: 3 },
    { label: L("「今夜いちばんデカい声、聞かせろ!!」", "\"Give me the loudest you've got tonight!!\""), favored: ["core", "light"], base: 3 },
    { label: L("「締めは、俺たちの美学を見せる」", "\"For the close, we show you our aesthetic.\""), favored: ["visual", "expert"], base: 3 },
  ],
  [
    { label: L("「体力、まだ残ってるよなァ!?」", "\"You've still got energy left, right!?\""), favored: ["core", "light"], base: 3 },
    { label: L("「一生分の思い出、置いてけ」", "\"Leave a lifetime of memories right here.\""), favored: ["visual", "expert"], base: 3 },
    { label: L("「最後の一音まで、魂込める」", "\"We pour our souls into the very last note.\""), favored: ["expert", "core"], base: 3 },
  ],
  [
    { label: L("「声が嗄れるまで叫べェ!!」", "\"Scream until your voice cracks!!\""), favored: ["core", "light"], base: 3 },
    { label: L("「この一体感、最高だろ？」", "\"This unity — it's the best, right?\""), favored: ["light", "core"], base: 3 },
    { label: L("「幕引きは、静かに、美しく」", "\"We bring the curtain down quietly, beautifully.\""), favored: ["visual", "expert"], base: 3 },
  ],
];

const SOLO_INSTR: Record<string, string> = { RYO: L("ボーカル", "Vocals"), KEN: L("ギター", "Guitar"), MIO: L("ベース", "Bass"), GO: L("ドラム", "Drums") };
const SOLO_BURST: Record<string, string> = {
  RYO: L("の絶叫がPAを突き破り、フロアが総立ちで咆哮を返す", "'s scream rips through the PA and the whole floor roars back on its feet"),
  KEN: L("の指が指板を疾走、速弾きに指笛と歓声が突き刺さる", "'s fingers race across the fretboard, whistles and cheers piercing the shred"),
  MIO: L("の重低音が地面ごと客を揺らし、地鳴りの縦ノリが起きる", "'s low end shakes the ground and the crowd with it, a rumbling wave of headbanging erupts"),
  GO: L("の連打がBPMをねじ上げ、モッシュの渦が爆ぜる", "'s barrage cranks up the BPM and a mosh pit bursts open"),
};

/** How well a member's stats fit a target layer (higher = better solo pick). */
const MATCH_BONUS = 2;
const segFit = (m: Member, t: Segment): number =>
  (["T", "P", "S", "V"] as Param[]).reduce((a, p) => a + SEG_WEIGHTS[t][p] * m[p], 0);
const bestSoloistKey = (s: GameState, t: Segment): string => {
  const cand = nonLeaders(s);
  return cand.reduce((best, m) => (segFit(m, t) > segFit(best, t) ? m : best), cand[0]).artKey;
};

/** Pre-show, now a two-round set (本編 → 間奏MC → アンコール). Each choice's
 *  payoff and reaction depend on the target fan layer and member 相性. */
export function buildLivePreScenes(state: GameState, decision: LiveDecision, rng: () => number = Math.random): Scene[] {
  const venue = decision.cap <= 300 ? L("小箱", "small club") : decision.cap <= 600 ? L("ホール", "hall") : L("アリーナ", "arena");
  const bg: BgKey = decision.cap >= 1000 ? "venueBig" : "venueSmall";
  const lead = leaderArt(state);
  const lname = nameOf(state, lead);
  const target = decision.target;
  const seg = segLabel(target);
  const others = nonLeaders(state).map((m) => m.artKey);
  const bud = pick(rng, others);
  const ideal = bestSoloistKey(state, target); // the member who best fits the target layer
  const react = (member: string, mood: Mood, text: string, fx?: Scene["fx"]): Scene => ({
    bg, chars: [{ member, pos: "center", mood }], speaker: nameOf(state, member), text, fx,
  });
  // A choice whose satisfaction and reaction depend on fitting the target layer.
  const fit = (
    label: string,
    favored: Segment[],
    base: number,
    whenMatch: (sat: number) => Scene,
    whenMiss: (sat: number) => Scene,
    extra?: (s: GameState) => void,
  ) => {
    const matched = favored.includes(target);
    const sat = base + (matched ? MATCH_BONUS : 0);
    return { label, apply: (s: GameState) => { s.buffs.liveSat += sat; extra?.(s); }, next: [matched ? whenMatch(sat) : whenMiss(sat)] };
  };
  // Build one MC option from a script entry, with shared match/miss reactions.
  const mkMc = (o: McOption) => fit(o.label, o.favored, o.base,
    (sat) => react(bud, "fired", L(`${nameOf(state, bud)}と客席が呼応！ ${seg}層のど真ん中に突き刺さった！（満足度+${sat}${o.note ?? ""}）`, `${nameOf(state, bud)} and the crowd feed off each other! It hit ${seg} fans dead center! (satisfaction +${sat}${o.note ?? ""})`), "shake"),
    (sat) => react(bud, "normal", L(`煽りはしっかり通った。が、${seg}層への刺さりはそこそこ。（満足度+${sat}${o.note ?? ""}）`, `The call landed cleanly. But for ${seg} fans, it only connected so-so. (satisfaction +${sat}${o.note ?? ""})`)),
    o.extra);
  // 5-pattern scripts, no back-to-back repeats.
  const mcChoices = LIVE_MC_SCRIPTS[pickIdxNoRepeat(state, "liveMc", LIVE_MC_SCRIPTS.length, rng)].map(mkMc);
  const encChoices = LIVE_ENCORE_MC_SCRIPTS[pickIdxNoRepeat(state, "liveEncoreMc", LIVE_ENCORE_MC_SCRIPTS.length, rng)].map(mkMc);

  return [
    {
      bg: "backstage",
      chars: [{ member: lead, pos: "center", mood: "fired" }],
      text: L(`${venue}の袖。今日のターゲットは${seg}層。深呼吸ひとつ——行くぞ。`, `Backstage at the ${venue}. Tonight's target is ${seg} fans. One deep breath——here we go.`),
    },
    // === 本編：MC第一声（5パターン・連続同一なし）===
    {
      bg, chars: [{ member: lead, pos: "center", mood: "fired" }], speaker: lname,
      text: L(`【本編・MC】${seg}層で埋まった客席へ、第一声は？`, `[Main Set / MC] The house is packed with ${seg} fans. Your opening line?`),
      choices: mcChoices,
    },
    // === 本編：ソロ回し（相性＝ターゲット最適メンバー）===
    {
      bg, chars: [{ member: lead, pos: "center", mood: "fired" }], speaker: lname,
      text: L(`【本編・ソロ回し】曲が最高潮。ここぞの見せ場、誰に振る？（${seg}層に刺さるのは…？）`, `[Main Set / Solo trade] The song peaks. Who gets the spotlight moment? (Who lands with ${seg} fans...?)`),
      choices: others.map((art) => {
        const matched = art === ideal;
        const sat = 3 + (matched ? MATCH_BONUS : 0);
        return {
          label: L(`「${SOLO_INSTR[art] ?? "ソロ"}——${nameOf(state, art)}ッ!!」`, `"${SOLO_INSTR[art] ?? L("ソロ", "Solo")}——${nameOf(state, art)}!!"`),
          apply: (s: GameState) => { s.buffs.liveSat += sat; addLove(s, art, 3); },
          next: [matched
            ? react(art, "fired", L(`${nameOf(state, art)}${SOLO_BURST[art] ?? "のソロが炸裂"}！${seg}層のツボにドハマり、大爆発だ！（満足度+${sat}・${nameOf(state, art)}の愛情度+3）`, `${nameOf(state, art)}${SOLO_BURST[art] ?? L("のソロが炸裂", "'s solo detonates")}! It hits the ${seg} sweet spot dead-on — total explosion! (satisfaction +${sat} / ${nameOf(state, art)} affection +3)`), "shake")
            : react(art, "fired", L(`${nameOf(state, art)}${SOLO_BURST[art] ?? "のソロが炸裂"}！ 沸くには沸くが、${seg}層への刺さりはそこそこ。（満足度+${sat}・${nameOf(state, art)}の愛情度+3）`, `${nameOf(state, art)}${SOLO_BURST[art] ?? L("のソロが炸裂", "'s solo detonates")}! The crowd goes off, but for ${seg} fans it only connects so-so. (satisfaction +${sat} / ${nameOf(state, art)} affection +3)`), "shake")],
        };
      }),
    },
    // === アンコール導入 ===
    {
      bg, chars: [{ member: pick(rng, others), pos: "center", mood: "happy" }],
      text: L("本編ラスト——照明が落ちても鳴り止まぬ「アンコール！」の大合唱。もう一度、ステージへ！", "End of the main set——even with the lights down, the \"Encore!\" chant won't stop. Back to the stage, once more!"),
      fx: "flash",
    },
    // === アンコール：間奏MC（5パターン・連続同一なし）===
    {
      bg, chars: [{ member: lead, pos: "center", mood: "fired" }], speaker: lname,
      text: L("【アンコール・MC】再びマイクを取る。締めの煽り、どういく？", "[Encore / MC] You grab the mic again. How do you rile them up for the close?"),
      choices: encChoices,
    },
    // === アンコール：ラストソングの締め ===
    {
      bg, chars: [{ member: lead, pos: "center", mood: "fired" }], speaker: lname,
      text: L("【アンコール・締め】ラストソング。どう終わらせる？", "[Encore / Close] The last song. How do you end it?"),
      choices: [
        fit(L("定番曲でブチ上げてフィニッシュ", "Finish big with a crowd favorite"), ["core", "light"], 4,
          (sat) => react(bud, "fired", L(`全員大合唱、会場が一つの生き物になる。${seg}層、大満足の大団円！（満足度+${sat}）`, `Everyone sings along, the venue becomes one living thing. ${seg} fans, a triumphant, thrilled finale! (satisfaction +${sat})`), "flash"),
          (sat) => react(bud, "happy", L(`手堅く締める。しっかり温まった。（満足度+${sat}）`, `A safe, solid close. Nicely warmed up. (satisfaction +${sat})`))),
        fit(L("新曲で勝負を賭ける", "Gamble on a new song"), ["expert", "core"], 4,
          (sat) => react(bud, "fired", L(`攻めの新曲——耳の肥えた${seg}層が唸り、深く頷く。挑戦が実った！（満足度+${sat}・知名度+1）`, `A daring new song——discerning ${seg} fans murmur and nod deep. The gamble paid off! (satisfaction +${sat} / fame +1)`), "flash"),
          (sat) => react(bud, "normal", L(`新曲を叩きつける。反応は分かれたが、爪痕は残した。（満足度+${sat}・知名度+1）`, `You slam down a new song. Reactions were split, but you left a mark. (satisfaction +${sat} / fame +1)`)),
          (s) => { s.fame = Math.min(100, s.fame + 1); }),
        fit(L("バラードでしっとり締める", "Close softly with a ballad"), ["visual", "expert"], 4,
          (sat) => react(lead, "happy", L(`揺れる無数のライト。${seg}層がうっとりと聴き入る、美しい幕引き。（満足度+${sat}・結束+3）`, `Countless lights sway. ${seg} fans listen, entranced — a beautiful curtain call. (satisfaction +${sat} / unity +3)`), "flash"),
          (sat) => react(lead, "normal", L(`余韻を残して締める。悪くない、が熱量はやや落ち着いた。（満足度+${sat}・結束+3）`, `You close on a lingering note. Not bad, though the heat settled a touch. (satisfaction +${sat} / unity +3)`)),
          (s) => { s.bond = Math.min(100, s.bond + 3); }),
      ],
    },
  ];
}

// --- ライブ後の打ち上げ（選択で結束・愛情度が動く）--------------------------

/** One after-party reply: effect + the host's response line. */
interface PartyOption { label: string; love: number; bond: number; stam?: number; mood: Mood; react: string }
interface PartyScript { ask: string; options: PartyOption[] }

/** 5 after-party conversations (host asks → 3 replies). No back-to-back repeats. */
const PARTY_SCRIPTS: PartyScript[] = [
  {
    ask: L("「ねえ、今日のライブ、リーダー的にどうだった？」", "\"Hey, as our leader — how'd tonight's show feel to you?\""),
    options: [
      { label: L("「全員最高だった。ありがとう」", "\"Everyone was incredible. Thank you.\""), love: 6, bond: 8, stam: 6, mood: "happy", react: L("「へへ、そう言われると照れるな。……次もいくぞ！」", "\"Heh, that's embarrassing to hear. ...Let's do the next one too!\"") },
      { label: L("「まだ通過点。次はもっと上だ」", "\"Just a waypoint. Next time we go higher.\""), love: 4, bond: 10, mood: "fired", react: L("「上等！ その意気、ついていくよ」", "\"Bring it! I'm right there with that fire.\"") },
      { label: L("「細けえ話は抜き、今日は飲むぞ！」", "\"No shop talk — tonight we drink!\""), love: 7, bond: 6, stam: -4, mood: "happy", react: L("「よっしゃ！ 今日は無礼講だ！」", "\"Yes! Tonight, anything goes!\"") },
    ],
  },
  {
    ask: L("「打ち上げの主役はリーダーでしょ。一言ちょうだい！」", "\"The star of the after-party is the leader, right? Give us a word!\""),
    options: [
      { label: L("「お前らがいて本当に良かった」", "\"I'm truly lucky to have all of you.\""), love: 8, bond: 7, mood: "happy", react: L("「……もう、泣かせないでよ」", "\"...Come on, don't make me cry.\"") },
      { label: L("「反省会だ。次に活かすぞ」", "\"Post-mortem time. Let's use it next show.\""), love: 3, bond: 9, stam: -2, mood: "fired", react: L("「うへぇ真面目。……でも、そういうとこ信頼してる」", "\"Ugh, so serious. ...But that's exactly what I trust about you.\"") },
      { label: L("「とりあえず乾杯！ 話は明日！」", "\"Cheers first! Talk tomorrow!\""), love: 6, bond: 6, stam: 4, mood: "normal", react: L("「あはは、それでこそ。かんぱーい！」", "\"Haha, that's more like it. Cheeers!\"") },
    ],
  },
  {
    ask: L("「次のライブはどこ狙う？ ……の前に、今日の感想は？」", "\"Where do we aim for next? ...But first, how was tonight?\""),
    options: [
      { label: L("「最高の夜だった。みんなのおかげ」", "\"Best night ever. All thanks to you all.\""), love: 7, bond: 7, mood: "happy", react: L("「えへへ、まかせて！ もっとデカくするよ」", "\"Ehehe, leave it to me! I'll make it even bigger.\"") },
      { label: L("「課題も見えた。詰めていこう」", "\"I saw our weak spots too. Let's sharpen them.\""), love: 4, bond: 8, stam: -2, mood: "fired", react: L("「ん、頼もしい。ついてく」", "\"Mm, dependable. I'm with you.\"") },
      { label: L("「今日は何も考えず飲もう」", "\"Tonight, let's just drink and not think.\""), love: 6, bond: 5, stam: 4, mood: "happy", react: L("「さんせー！ ぐいっといこ！」", "\"Agreed~! Bottoms up!\"") },
    ],
  },
  {
    ask: L("「リーダー、お疲れ！ ……なんか、いい顔してるね？」", "\"Good work, leader! ...You've got a nice look on your face, huh?\""),
    options: [
      { label: L("「お前らと組めて幸せだ、って顔だよ」", "\"It's the face of someone happy to be in a band with you.\""), love: 8, bond: 8, mood: "happy", react: L("「……っ、ずるいなあ、その言い方」", "\"...Ngh, that's a cheap way to put it.\"") },
      { label: L("「まだ満足してない顔だ」", "\"It's the face of someone not satisfied yet.\""), love: 4, bond: 9, mood: "fired", react: L("「ふふ、貪欲。だから好きなんだ、このバンド」", "\"Heh, greedy. That's why I love this band.\"") },
      { label: L("「腹減った顔だ。飯行こう」", "\"It's a hungry face. Let's go eat.\""), love: 6, bond: 6, stam: 4, mood: "normal", react: L("「あははっ、なにそれ！ 行こ行こ！」", "\"Hahaha, what's that! Let's go, let's go!\"") },
    ],
  },
  {
    ask: L("「今日のMVP、誰だと思う？ ……リーダーはどう見てた？」", "\"Who do you think was tonight's MVP? ...How'd it look to you, leader?\""),
    options: [
      { label: L("「全員がMVPだ。胸張れ」", "\"Every one of you is MVP. Stand tall.\""), love: 7, bond: 8, mood: "happy", react: L("「もー、ずるい答え！ ……でも嬉しい」", "\"Ugh, such a cop-out answer! ...But it makes me happy.\"") },
      { label: L("「あえて言うなら、次の自分たちだ」", "\"If I had to pick — our future selves.\""), love: 4, bond: 9, mood: "fired", react: L("「かっこつけ！ ……嫌いじゃないけどね」", "\"Show-off! ...Not that I hate it.\"") },
      { label: L("「MVPは、来てくれた客だろ」", "\"The MVP is the crowd that showed up.\""), love: 6, bond: 7, mood: "normal", react: L("「……たしかに。あんた、たまに良いこと言う」", "\"...True. You say something good once in a while.\"") },
    ],
  },
];

/** After-party at the month-end live: tone shifts with how the show went, and
 *  the conversation is one of 5 scripts (never the same one twice running). */
export function buildAfterPartyScenes(state: GameState, r: LiveResult, rng: () => number = Math.random): Scene[] {
  const great = r.satisfaction >= 65;
  const crew = state.members.map((m) => m.artKey);
  const host = pick(rng, state.members.filter((m) => !m.isLeader)).artKey;
  const hname = nameOf(state, host);
  const opener = great
    ? L("打ち上げへ繰り出す。「今日は最高だった！ 乾杯——！」グラスがぶつかる。", "Off to the after-party. \"Tonight was the best! Cheers——!\" Glasses clink together.")
    : L("打ち上げへ。「まあ、こういう日もある」ぬるいビールで小さく乾杯。", "Off to the after-party. \"Well, some days are like this.\" A small toast with warm beer.");
  const partyMood: Mood = great ? "happy" : "normal";
  const chars: Scene["chars"] = crew.map((a, i) => ({
    member: a,
    pos: (["left", "center", "right", "left"] as const)[i] ?? "center",
    mood: partyMood,
  }));
  const summary = (love: number, bond: number, stam = 0) =>
    L(`全員の愛情度+${love}・結束+${bond}${stam ? `・体力${stam >= 0 ? "+" : ""}${stam}` : ""}`, `all affection +${love} / unity +${bond}${stam ? ` / stamina ${stam >= 0 ? "+" : ""}${stam}` : ""}`);
  const script = PARTY_SCRIPTS[pickIdxNoRepeat(state, "party", PARTY_SCRIPTS.length, rng)];
  const choices = script.options.map((o) => ({
    label: o.label,
    apply: (s: GameState) => {
      s.members.forEach((m) => { if (!m.isLeader) m.love = Math.min(100, m.love + o.love); });
      s.bond = Math.min(100, s.bond + o.bond);
      if (o.stam) addStamina(s, o.stam);
      pushLog(s, L(`打ち上げ：${summary(o.love, o.bond, o.stam ?? 0)}`, `After-party: ${summary(o.love, o.bond, o.stam ?? 0)}`));
    },
    next: [
      {
        bg: "backstage" as BgKey,
        chars: [{ member: host, pos: "center" as const, mood: o.mood }],
        speaker: hname,
        text: L(`${o.react}\n\n（${summary(o.love, o.bond, o.stam ?? 0)}）`, `${o.react}\n\n(${summary(o.love, o.bond, o.stam ?? 0)})`),
        fx: "flash" as Scene["fx"],
      },
    ],
  }));
  return [
    { bg: "backstage", chars, text: opener, fx: great ? "flash" : undefined },
    { bg: "backstage", chars: [{ member: host, pos: "center", mood: partyMood }], speaker: hname, text: script.ask, choices },
  ];
}

// --- 見た目の進化（客層でS評価＝満足度80以上を取ると解禁。累積で融合）------
// 姿は「解禁済みの層の集合」で決まる: 1層=単体ジャンル / 2層=そのペア融合 /
// 3層以上=究極形態（look/名称の解決は game/evolution.ts）。

function buildEvolutionScenes(infix: string, seg: Segment): Scene[] {
  const t = EVO_LOOK[infix];
  const lineup = (mood: Mood): Scene["chars"] =>
    (["RYO", "KEN", "MIO", "GO"] as const).map((a, i) => ({ member: a, pos: (["left", "center", "right", "left"] as const)[i], mood }));
  return [
    { bg: "venueBig", chars: lineup("fired"), text: L(`✨✨ 進化 ✨✨\n\n${segLabel(seg)}層をS評価で熱狂させた衝撃が、バンドの姿を作り変えていく——！`, `✨✨ EVOLUTION ✨✨\n\nThe shock of whipping ${segLabel(seg)} fans into an S-rank frenzy reshapes the band's very look——!`), fx: "flash" },
    { bg: "backstage", chars: lineup("happy"), text: L(`【${t.name}】\n\n${t.desc}\n\nメンバー全員の見た目が進化した！（客層でSを取るたびに、その要素が加わって姿が融合していく）`, `[${t.name}]\n\n${t.desc}\n\nThe whole band's look evolved! (Each time you earn an S with an audience, that element is added and the look fuses further.)`), fx: "flash" },
  ];
}

/** After a live: an S rating (satisfaction ≥ 80) unlocks the targeted layer's
 *  look. The band's appearance is the CUMULATIVE fusion of every unlocked layer
 *  (2 = a pair fusion, 3+ = the ultimate). Returns evolution scenes only when a
 *  live unlocks a NEW layer (i.e. the fused look actually changes). */
export function registerLiveEvolution(state: GameState, target: Segment, satisfaction: number): Scene[] {
  if (satisfaction < 80) return [];
  const firstTime = !state.evoUnlocked[target];
  state.evoUnlocked[target] = true;
  state.evolution = target; // last-earned layer (scene focus / legacy field)
  if (!firstTime) return [];
  const infix = evolutionInfix(state.evoUnlocked);
  pushLog(state, L(`✨ ${segLabel(target)}層でS評価！ 見た目が「${EVO_LOOK[infix].name}」へ進化！`, `✨ S-rank with ${segLabel(target)} fans! The look evolved into "${EVO_LOOK[infix].name}"!`));
  return buildEvolutionScenes(infix, target);
}

/** Scout a support member, spending 人脈. Returns the intro scenes. */
export function resolveRecruit(state: GameState, role: StaffRole): { scenes: Scene[] } {
  const def = STAFF_DEFS[role];
  state.contacts = Math.max(0, state.contacts - def.contactCost);
  state.staff.push({ role, intimacy: 30, cut: def.cut });
  const pct = Math.round(def.cut * 100);
  pushLog(state, L(`${staffLabel(role)}が加入！（人脈-${def.contactCost} / 人件費${pct}%）`, `${staffLabel(role)} joined! (contacts -${def.contactCost} / payroll ${pct}%)`));
  return {
    scenes: [
      scene("backstage", [leaderArt(state)], L(`${staffLabel(role)}がチームに加わった。\n\n${def.desc}\nただしライブ収益の${pct}%が人件費に。親密度が下がると離脱・トラブルの恐れ（「バンド関係者との交流」で親密度UP）。`, `${staffLabel(role)} has joined the team.\n\n${def.desc}\nBut ${pct}% of live earnings now goes to payroll. If rapport drops, they may walk out or cause trouble (raise rapport via "Networking > Bandmates").`), { fx: "flash" }),
    ],
  };
}

function resolveMoney(state: GameState, rng: () => number): { scenes: Scene[] } {
  const amt = 40_000 + Math.floor(rng() * 30_000); // 40k–70k（活動費で足りなくなりがち）
  state.funds += amt;
  spend(state, 12);
  pushLog(state, L(`アルバイト：${yen(amt)}稼いだ`, `Part-time job: earned ${yen(amt)}`));
  return { scenes: moneyScenes(L(`${yen(amt)}を稼いだ。スタジオ代やライブの会場費はここで貯める。`, `Earned ${yen(amt)}. This is how you save up for studio fees and live venue costs.`), rng) };
}

// --- Items ------------------------------------------------------------------

const bandAvg = (s: GameState, p: Param): number =>
  Math.round(s.members.reduce((a, m) => a + m[p], 0) / (s.members.length || 1));
const addStaffIntimacy = (s: GameState, d: number) =>
  s.staff.forEach((st) => (st.intimacy = Math.max(0, Math.min(100, st.intimacy + d))));
const setPracticeBuff = (s: GameState, mult: number, turns: number) => {
  s.buffs.practiceMult = mult;
  s.buffs.practiceTurns = turns;
};

export interface ItemDef {
  id: string;
  name: string;
  tier: "S" | "A" | "B";
  effect: string;
  desc: string;
  appearReq?: (s: GameState) => boolean; // appearance condition (drop pool)
  apply: (s: GameState) => void;
}

export const ITEMS: ItemDef[] = [
  { id: "metalianD", name: L("メタリアンD", "Metalian-D"), tier: "B", effect: L("使用すると体力が最大60回復", "Restores up to 60 stamina when used"), desc: L("コンビニに売ってる栄養ドリンク。美味しくはない", "A convenience-store energy drink. Not exactly tasty."), apply: (s) => addStamina(s, 60) },
  { id: "hellTraining", name: L("地獄のメカニカルトレーニング", "Hellish Mechanical Training"), tier: "B", effect: L("使用したターンの練習効果が2倍", "Doubles practice gains for the turn it's used"), desc: L("伝説の教則本。速弾きを極めるならこれだ。", "The legendary instruction book. If you want to master shredding, this is it."), apply: (s) => setPracticeBuff(s, 2, 1) },
  { id: "baaaan", name: "BAAAAN!!", tier: "B", effect: L("使用すると音楽センス+4", "Songcraft +4 when used"), desc: L("メタラーの愛読書。どれどれ、今月の表紙はだれかな？", "Every metalhead's favorite mag. Now, who's on this month's cover?"), apply: (s) => addParam(s, "S", 4) },
  { id: "studJacket", name: L("スタッズの付いた革ジャン", "Studded Leather Jacket"), tier: "B", effect: L("使用するとビジュ力+4", "Looks +4 when used"), desc: L("これを着ればモテモテ間違いなし！", "Wear this and you're guaranteed to turn heads!"), apply: (s) => addParam(s, "V", 4) },
  { id: "boinKiller", name: L("ボインキラー", "Boin-Killer"), tier: "B", effect: L("使用したターンに休息を取ると体力が全回復する", "If you rest the turn it's used, stamina fully restores"), desc: L("エッチな本。", "A naughty magazine."), apply: (s) => { s.buffs.restFull = true; } },
  { id: "jackDaniels", name: L("ジャックダミエルズ", "Jack Daniel's"), tier: "B", effect: L("使用したターンの練習効果が4倍になるが、親密度が-10する", "Quadruples practice gains for the turn, but rapport -10"), desc: L("飲まなきゃやってられねぇ", "Can't get through this sober."), apply: (s) => { setPracticeBuff(s, 4, 1); addStaffIntimacy(s, -10); } },
  { id: "hyperMetronome", name: L("ハイパーメトロノーム", "Hyper Metronome"), tier: "A", effect: L("使用すると演奏基礎+4、且つ使用したターンの練習効果が1.5倍", "Musicianship +4, and 1.5x practice gains for the turn"), desc: L("BPM300まで数えられるメトロノーム", "A metronome that counts all the way to BPM 300."), apply: (s) => { addParam(s, "T", 4); setPracticeBuff(s, 1.5, 1); } },
  { id: "bloodLetter", name: L("血まみれのファンレター", "Bloodstained Fan Letter"), tier: "A", effect: L("使用するとパフォーマンス+10、ただし体力が20減る", "Performance +10, but stamina -20"), desc: L("ボロボロの紙に血でこう書かれている。「一生推します」", "Scrawled in blood on tattered paper: \"I'll stan you for life.\""), appearReq: (s) => bandAvg(s, "V") >= 50 && s.totalFans >= 4000, apply: (s) => { addParam(s, "P", 10); addStamina(s, -20); } },
  { id: "silentGuitar", name: L("サイレントギター", "Silent Guitar"), tier: "A", effect: L("使用するとそのターンから3ターンの間練習効果が2倍", "Doubles practice gains for 3 turns starting this one"), desc: L("これで夜中も練習し放題！", "Now you can practice all night long!"), apply: (s) => setPracticeBuff(s, 2, 3) },
  { id: "starStrings", name: L("星の弦", "Star Strings"), tier: "A", effect: L("使用したターンにライブをすると動員数が満員になるが満足度は-30される", "Sells out attendance if you play a show this turn, but satisfaction -30"), desc: L("人気になるってのは、それはそれで大変だよな", "Getting popular is its own kind of hard, huh."), appearReq: (s) => s.rank === "major" && bandAvg(s, "V") >= 50, apply: (s) => { s.buffs.liveSellout = true; s.buffs.liveSat -= 30; } },
  { id: "batThing", name: L("例のコウモリ", "That Infamous Bat"), tier: "S", effect: L("使用したターンにライブがある場合、顧客満足度が+40", "If there's a show this turn, satisfaction +40"), desc: L("コウモリの人形を食べるパフォーマンスのはずが本物のコウモリだったんだよ", "It was supposed to be a stunt biting a toy bat — turns out it was a real one."), apply: (s) => { s.buffs.liveSat += 40; } },
  { id: "whitePowder", name: L("白い粉", "White Powder"), tier: "S", effect: L("使用したターンに作成した曲の完成度が95になる、ただし体力が0になり親密度も-20になる", "A song written this turn hits quality 95, but stamina drops to 0 and rapport -20"), desc: L("危険な粉。すべてを差し出す覚悟はあるか？", "A dangerous powder. Ready to give up everything?"), apply: (s) => { s.buffs.composeQ95 = true; s.members.forEach((m) => (m.stamina = 0)); addStaffIntimacy(s, -20); } },
  { id: "metalGodProof", name: L("メタルゴッドの証", "Proof of the Metal God"), tier: "S", effect: L("使用すると演奏基礎、パフォーマンス、音楽センス、ビジュ力が+30され、総ファン数が2倍になる", "Musicianship, Performance, Songcraft, and Looks all +30, and total fans doubled"), desc: L("メタルゴッドはすべてのメタルバンドを愛している", "The Metal God loves every metal band."), appearReq: (s) => s.stage >= 4, apply: (s) => { (["T", "P", "S", "V"] as Param[]).forEach((p) => addParam(s, p, 30)); s.totalFans *= 2; } },
];

const ITEM_BY_ID: Record<string, ItemDef> = Object.fromEntries(ITEMS.map((i) => [i.id, i]));
export const itemDef = (id: string): ItemDef | undefined => ITEM_BY_ID[id];

/** Clear turn-scoped buffs and tick down multi-turn practice buffs. */
export function tickTurnBuffs(state: GameState): void {
  state.buffs.restFull = false;
  state.buffs.composeQ95 = false;
  if (state.buffs.practiceTurns > 0) {
    state.buffs.practiceTurns -= 1;
    if (state.buffs.practiceTurns <= 0) state.buffs.practiceMult = 1;
  } else {
    state.buffs.practiceMult = 1;
  }
}

/** Use an owned item (mutates). Returns its name + a short use-scene, or null. */
export function useItem(
  state: GameState,
  id: string,
  rng: () => number = Math.random,
): { name: string; scenes: Scene[] } | null {
  if ((state.items[id] ?? 0) <= 0) return null;
  const def = ITEM_BY_ID[id];
  if (!def) return null;
  state.items[id] -= 1;
  def.apply(state);
  pushLog(state, L(`アイテム使用：${def.name}`, `Used item: ${def.name}`));
  return { name: def.name, scenes: itemUseScenes(id, def.name, def.effect, rng) };
}

/** 30% after an action: roll a tier (S2/A18/B80), then a random eligible item. */
export function maybeFindItem(state: GameState, rng: () => number = Math.random): Scene[] | null {
  if (tutorialActive(state)) return null; // no surprise drops mid-tutorial
  if (rng() >= 0.25) return null; // ~1 drop per month (4 actions)
  const r = rng();
  const tier = r < 0.02 ? "S" : r < 0.2 ? "A" : "B";
  const pool = ITEMS.filter((i) => i.tier === tier && (!i.appearReq || i.appearReq(state)));
  if (pool.length === 0) return null;
  const item = pool[Math.floor(rng() * pool.length)];
  state.items[item.id] = (state.items[item.id] ?? 0) + 1;
  pushLog(state, L(`🎁 差し入れをもらった：${item.name}（${item.tier}）`, `🎁 Got a gift: ${item.name} (${item.tier})`));
  return itemFindScenes(item.tier, item.name, item.effect, rng, item.id);
}

/**
 * Advance past the just-resolved action. Returns "live" if the month's
 * action turns are done (time for the month-end live), else "board".
 */
export function advanceTurn(state: GameState, rng: () => number = Math.random): "live" | "board" {
  if (state.turn >= state.turnsPerMonth) return "live";
  state.turn += 1;
  tickTurnBuffs(state);
  dealHand(state, rng);
  return "board";
}

/** Reset for a new month: age songs, decay practice, recover a little. */
export function startNewMonth(state: GameState, rng: () => number = Math.random): void {
  state.month += 1;
  state.turn = 1;
  state.practiceFreshness = Math.max(0, state.practiceFreshness - 30);
  for (const s of state.songs) s.age += 1;
  // Tighter bands recover a little better between months (bond payoff).
  const recover = 6 + Math.round(state.bond * 0.1);
  for (const m of state.members) m.stamina = Math.min(100, m.stamina + recover);
  // Staff intimacy cools over time; anyone at zero walks out (defection).
  for (const st of state.staff) st.intimacy = Math.max(0, st.intimacy - 6);
  const leaving = state.staff.filter((st) => st.intimacy <= 0);
  if (leaving.length) {
    state.staff = state.staff.filter((st) => st.intimacy > 0);
    for (const st of leaving) pushLog(state, L(`${staffLabel(st.role)}が離脱した…（親密度が尽きた）`, `${staffLabel(st.role)} walked out... (rapport ran dry)`));
  }
  // Market meta: trends drift, rivals grind, tie-ups age, a new offer may appear.
  for (const line of tickMarket(state, rng)) pushLog(state, line);
  tickTurnBuffs(state);
  dealHand(state, rng);
  pushLog(state, L(`--- ${state.month}ヶ月目 スタート ---`, `--- Month ${state.month} begins ---`));
}

/** Accept the pending tie-up offer (called from the offer event). */
export function resolveTieupAccept(state: GameState): void {
  const t = state.tieupOffer;
  acceptTieup(state);
  if (t) pushLog(state, L(`🤝 タイアップ「${t.name}」を受諾！ ${segLabel(t.seg)}層が沸き立つ（+¥${t.fee.toLocaleString()}）。`, `🤝 Accepted the "${t.name}" tie-up! ${segLabel(t.seg)} fans buzz with excitement (+¥${t.fee.toLocaleString()}).`));
}

/** Decline the pending tie-up offer. */
export function resolveTieupDecline(state: GameState): void {
  const t = state.tieupOffer;
  state.tieupOffer = null;
  if (t) pushLog(state, L(`タイアップ「${t.name}」を見送った。`, `Passed on the "${t.name}" tie-up.`));
}

/** Month-start tie-up offer as a choice event (accept surges a segment but locks
 *  the band's image; declining keeps you free). Empty when no offer is pending. */
export function buildTieupOfferScenes(state: GameState): Scene[] {
  const t = state.tieupOffer;
  if (!t) return [];
  const oppLabel = segLabel(({ visual: "core", core: "visual", light: "expert", expert: "light" } as Record<Segment, Segment>)[t.seg]);
  return [
    {
      bg: "backstage",
      chars: [{ member: "RYO", pos: "center", mood: "normal" }],
      speaker: L("マネージャー", "Manager"),
      text: L(`タイアップの話が来てる。「${t.name}」——${segLabel(t.seg)}層に一気に刺さる。契約金¥${t.fee.toLocaleString()}。\nただし数ヶ月はバンドのイメージが縛られる（${oppLabel}層ウケは落ちる）。受ける？`, `We've got a tie-up offer. "${t.name}"——it'll land hard with ${segLabel(t.seg)} fans. Signing fee ¥${t.fee.toLocaleString()}.\nBut it locks the band's image for a few months (appeal to ${oppLabel} fans drops). Take it?`),
      choices: [
        { label: L(`受ける（${segLabel(t.seg)}層に賭ける）`, `Accept (bet on ${segLabel(t.seg)} fans)`), apply: (s) => resolveTieupAccept(s) },
        { label: L("見送る（自由でいる）", "Pass (stay free)"), apply: (s) => resolveTieupDecline(s) },
      ],
    },
  ];
}

// --- Milestone ladder & game over (checkpoints) -----------------------------

export interface Milestone {
  id: string;
  label: string;
  deadline: number; // must be cleared by this month, else disband
  req: { power?: number; fans?: number; songs?: number; bond?: number; fame?: number };
  bg: BgKey;
  flavor: string; // shown on achievement
  intro: string; // shown when this milestone becomes the next target
}

/** Band "演奏力" = mean of every member's T/P/S/V. */
export const bandPower = (s: GameState): number => {
  const per = s.members.map((m) => (m.T + m.P + m.S + m.V) / 4);
  return Math.round(per.reduce((a, b) => a + b, 0) / (per.length || 1));
};

export const MILESTONES: Milestone[] = [
  { id: "gateway", label: L("アマチュア登竜門ライブ", "Amateur Proving-Ground Show"), deadline: 8, req: { power: 52, fans: 1600 }, bg: "venueSmall", flavor: L("登竜門ライブを勝ち抜いた！シーンに名前が知れ渡る。", "You conquered the proving-ground show! Your name spreads through the scene."), intro: L("アマチュアバンドの登竜門ライブ。ここに立てなければ話にならない。まずは演奏力を鍛え、動員できるファンを集めろ。", "The proving-ground show for amateur bands. If you can't stand here, nothing else matters. First, build your musicianship and gather fans you can pull in.") },
  { id: "indiefes", label: L("インディーズメタルフェス", "Indie Metal Festival"), deadline: 15, req: { power: 58, fans: 3200, songs: 3 }, bg: "venueBig", flavor: L("インディーズフェスのステージへ！観客の規模が跳ね上がる。", "Onto the indie festival stage! Your audience leaps in size."), intro: L("インディーズメタルフェスからのオファーを掴む。より高い演奏力とファンに加え、武器となる楽曲の数（曲数）も問われる。", "Land an offer from the Indie Metal Festival. On top of higher musicianship and more fans, the number of songs in your arsenal matters too.") },
  { id: "major", label: L("メジャーデビュー", "Major-Label Debut"), deadline: 24, req: { power: 66, fans: 6000, bond: 50 }, bg: "venueBig", flavor: L("メジャーデビュー決定！大箱ライブとサポート招致が解禁。ここからが本当の勝負だ。", "Major-label debut confirmed! Big-venue shows and support-staff recruiting unlock. The real fight starts here."), intro: L("夢の入り口、メジャーデビュー。実力とファンはもちろん、ここまで来たバンドの結束が試される。", "The doorway to the dream: a major-label debut. Skill and fans, of course — but the unity you've built this far is put to the test too.") },
  { id: "bigfes", label: L("大型フェスのオファー", "Major Festival Offer"), deadline: 36, req: { power: 74, fans: 14000, fame: 64 }, bg: "venueBig", flavor: L("大型フェスのメインステージへ大抜擢！", "Handpicked for the main stage of a major festival!"), intro: L("大型フェスのメインステージ。圧倒的な演奏力と、広く届く知名度がものを言う。", "The main stage of a major festival. Overwhelming musicianship and far-reaching fame are what count.") },
  { id: "overseas", label: L("海外進出", "Going Overseas"), deadline: 50, req: { power: 80, fans: 36000, fame: 78 }, bg: "venueBig", flavor: L("ついに海外へ——世界がバンドを待っている！", "Overseas at last——the world is waiting for the band!"), intro: L("最終目標、海外進出。世界に通用する実力・知名度・そして膨大なファン。全てを頂点まで引き上げろ。", "The final goal: going overseas. World-class skill, fame, and a massive fanbase. Push it all to the peak.") },
];

/** Summarize a milestone's requirements as "演奏力55・ファン2,000" for text. */
function reqSummary(m: Milestone): string {
  return (Object.keys(m.req) as (keyof Milestone["req"])[])
    .map((k) => `${REQ_LABEL[k]}${(m.req[k] ?? 0).toLocaleString()}`)
    .join(L("・", " / "));
}

/** Opening monologue centered on the chosen leader (played after part select). */
// --- リーダー個別ストーリー（パート＝選択キャラごとの物語）-------------------
// 大枠（関門）は共通。開始時のバックストーリーと、各関門突破時の個別ビートで、
// 選んだメンバーの性格・パート・過去を掘り下げる。他メンバーは固定名で登場。

/** A one-character scene with a mood + speaker tag. */
const solo = (state: GameState, bg: BgKey, art: string, mood: Mood, text: string, fx?: Scene["fx"]): Scene => ({
  bg, chars: [{ member: art, pos: "center", mood }], speaker: nameOf(state, art), text, fx,
});

/** Per-part opening backstory (2 scenes). Leader = L, display name = nm. */
const LEADER_INTRO: Record<string, (s: GameState, lead: string, nm: string) => Scene[]> = {
  Vo: (s, lead, nm) => [
    solo(s, "venueSmall", lead, "fired", L(`——幼い頃、親に連れて行かれた小さなライブハウス。腹の底を殴るような轟音に、${nm}の心臓は鷲掴みにされた。`, `——As a kid, dragged along to a tiny live house by my parents. A roar that punched me in the gut seized ${nm}'s heart and never let go.`), "flash"),
    solo(s, "street", lead, "normal", L("勉強も運動も、からっきし。でもいい。あたしにはメタルがある。この内臓に響くデスボイスで、世界をぶっ叩く。それだけだ。", "Hopeless at school, hopeless at sports. Doesn't matter. I've got metal. I'll pummel the world with a death voice that rattles your guts. That's all.")),
  ],
  Gt: (s, lead, nm) => [
    solo(s, "studio", lead, "normal", L(`——音楽一家に生まれ、物心つく前から楽器を握らされてきた。ピアノも、ヴァイオリンも。だが${nm}の心を灼いたのは、歪んだギターだった。`, `——Born into a family of musicians, handed instruments before I could even remember. Piano, violin. But what set ${nm}'s heart ablaze was a distorted guitar.`), "flash"),
    solo(s, "studio", lead, "fired", L("「メタルなんて」と親族は眉をひそめる。……上等だ。速弾きで黙らせてやる。有名になんてならなくていい。俺は、俺の理想の音を追う。", "\"Metal, of all things,\" my relatives sneer. ...Fine by me. I'll shut them up with my shredding. I don't need to be famous. I chase my own ideal sound.")),
  ],
  Ba: (s, lead, nm) => [
    solo(s, "studio", lead, "normal", L(`——軽音部で組んだバンド。人が足りなくて、ギター志望だった${nm}が渋々握ったのがベースだった。`, `——A band thrown together in the light-music club. Short on people, ${nm} — who'd wanted to play guitar — reluctantly picked up the bass.`), "flash"),
    solo(s, "studio", lead, "happy", L("……なのに今は、この低音がたまらなく愛おしい。売れなくてもいい。ただ、この仲間と、ずっと長くバンドを続けたい。それだけ。", "...And yet now, I adore this low end more than anything. I don't need to make it big. I just want to keep this band going with these people, for a long, long time. That's all.")),
  ],
  Dr: (s, lead) => [
    solo(s, "street", lead, "happy", L("——元・陸上部。ある日RISAに「速く走るにはドラムを練習するといい」と誘われて、あたしはこの世界に飛び込んだ！", "——Ex-track team. One day RISA told me \"if you want to run faster, you should practice drums,\" and I dove headfirst into this world!"), "flash"),
    solo(s, "studio", lead, "fired", L("メタル？ 正直よく分かんない！ でも叩くのは超楽しいし、体力には自信あり！ ……ところでこれ、ほんとに足、速くなるんだよね？", "Metal? Honestly, no clue! But drumming's super fun and I've got stamina to spare! ...By the way, this actually makes me run faster, right?")),
  ],
};

/** Build the chosen leader's backstory intro (falls back to a generic line). */
export function buildLeaderIntro(state: GameState): Scene[] {
  const lead = leaderArt(state);
  const nm = nameOf(state, lead);
  const build = LEADER_INTRO[state.leaderPart];
  return build ? build(state, lead, nm) : [solo(state, "street", lead, "normal", L(`——${nm}。歪んだ轟音だけが、生きる証だ。`, `——${nm}. A distorted roar is the only proof I'm alive.`), "flash")];
}

/** Per-part story beat fired when a checkpoint is cleared (keyed by its id). */
const LEADER_ARC: Record<string, Record<string, (s: GameState, lead: string, nm: string) => Scene[]>> = {
  Vo: {
    gateway: (s, lead) => [
      solo(s, "backstage", lead, "normal", L("打ち上げの喧騒が引いて、一人になった瞬間——ふっと、静けさが刺さる。（……にぎやかにしてないと、寂しさに飲まれそうになるんだ）", "The after-party noise fades, and the moment I'm alone——the quiet cuts in. (...If it isn't loud around me, the loneliness threatens to swallow me whole.)")),
      solo(s, "studio", "MIO", "happy", L("「……RISA。次のスタジオ、いつもの時間でいい？」何気ないその一言に、少しだけ救われる。", "\"...RISA. Next studio, usual time okay?\" That offhand little line saves me, just a little.")),
    ],
    indiefes: (s, lead) => [
      solo(s, "backstage", lead, "happy", L("大事なライブ前だってのに、RISAはご機嫌で酒瓶を掲げている。「かたいこと言うなって〜！」……止める？", "Big show coming up, and RISA's in high spirits, hoisting a bottle. \"Don't be so uptight~!\" ...Stop her?")),
      {
        bg: "backstage", chars: [{ member: lead, pos: "center", mood: "normal" }],
        text: L("Voはコンディションが命。でも、酒は彼女の相棒でもある——どうする？", "For a vocalist, condition is everything. But the drink is her companion too——what do you do?"),
        choices: [
          { label: L("「今日は喉を守れ」と止める", "\"Protect your voice today\" — stop her"), apply: (st) => { addStamina(st, 8); addLove(st, lead, 2); pushLog(st, L("個別STORY：RISAの喉を守った（体力+8・愛情度+2）", "Personal STORY: protected RISA's voice (stamina +8 / affection +2)")); },
            next: [solo(s, "backstage", lead, "normal", L("「ちぇ〜っ、真面目か。……まあ、あんたがそう言うなら。」渋々ボトルを置いた。（体力+8・愛情度+2）", "\"Tch~, such a stiff. ...Well, if you say so.\" She reluctantly set the bottle down. (stamina +8 / affection +2)"), "flash")] },
          { label: L("「今日くらい付き合う」", "\"I'll drink with you, just for tonight\""), apply: (st) => { addStamina(st, -6); addLove(st, lead, 6); st.bond = Math.min(100, st.bond + 5); pushLog(st, L("個別STORY：RISAと飲み明かした（愛情度+6・結束+5・体力-6）", "Personal STORY: drank the night away with RISA (affection +6 / unity +5 / stamina -6)")); },
            next: [solo(s, "backstage", lead, "happy", L("「そうこなくっちゃ！ 今夜はとことん付き合えよ〜！」笑い声が夜に溶ける。（愛情度+6・結束+5・体力-6）", "\"Now you're talking! You're staying with me till the very end tonight~!\" Laughter melts into the night. (affection +6 / unity +5 / stamina -6)"), "flash")] },
        ],
      },
    ],
    major: (s, lead) => [
      solo(s, "studio", "MIO", "sad", L("メジャーデビュー直後。スーツの男がRISAに名刺を差し出した。「君、ソロでやる気はないか？ もっと売れるよ」", "Right after the major debut. A man in a suit hands RISA a business card. \"You ever think about going solo? You'd sell a lot more.\"")),
      {
        bg: "studio", chars: [{ member: lead, pos: "center", mood: "normal" }],
        text: L("RISAがこちらを見る。「……あんたは、どう思う？」——バンドの、リーダーとして。", "RISA looks over at you. \"...What do you think?\"——as the band's leader."),
        choices: [
          { label: L("「お前の居場所はここだ」と引き止める", "\"Your place is here\" — hold her back"), apply: (st) => { st.bond = Math.min(100, st.bond + 12); addLove(st, lead, 8); pushLog(st, L("個別STORY：RISAはバンドを選んだ（結束+12・愛情度+8）", "Personal STORY: RISA chose the band (unity +12 / affection +8)")); },
            next: [solo(s, "backstage", lead, "happy", L("「……だよな。あたしもそう思ってた。」名刺を破り捨て、にっと笑う。「あたしの声は、この四人のためにある。」（結束+12・愛情度+8）", "\"...Yeah. I thought so too.\" She rips up the card and grins. \"My voice belongs to these four.\" (unity +12 / affection +8)"), "flash")] },
          { label: L("「翼を広げてみろ」と背中を押す", "\"Spread your wings\" — give her a push"), apply: (st) => { st.fame = Math.min(100, st.fame + 3); addLove(st, lead, 5); st.bond = Math.max(0, st.bond - 6); pushLog(st, L("個別STORY：RISAはソロも少し経験（知名度+3・愛情度+5・結束-6）", "Personal STORY: RISA tried a bit of solo work (fame +3 / affection +5 / unity -6)")); },
            next: [solo(s, "street", lead, "normal", L("「……ちょっとだけ、外の風も浴びてくる。でも、帰る場所はここだからな。」少しの寂しさと、確かな信頼。（知名度+3・愛情度+5・結束-6）", "\"...I'll go catch a little outside air. But this is where I come home to.\" A touch of loneliness, and unmistakable trust. (fame +3 / affection +5 / unity -6)"), "flash")] },
        ],
      },
    ],
    bigfes: (s, lead) => [
      solo(s, "venueBig", lead, "happy", L("満員の大観衆を前に、RISAはふと笑った。「……昔のあたしに教えてやりたいよ。お前、ちゃんと居場所を見つけるぞって。」\n\n寂しがり屋のフロントウーマンは、もう一人じゃない。", "Facing a sold-out crowd, RISA suddenly smiled. \"...I wish I could tell my old self — hey, you're gonna find where you belong.\"\n\nThe lonely frontwoman isn't alone anymore."), "flash"),
    ],
  },
  Gt: {
    gateway: (s, lead) => [
      {
        bg: "backstage", chars: [{ member: lead, pos: "center", mood: "sad" }],
        text: L("初勝利のあとの取材。NAOはマイクを向けられ、露骨に固まっている。（……人前で喋るのは、苦手なんだ）どうする？", "An interview after the first win. A mic is thrust at NAO and she visibly freezes up. (...She's terrible at speaking in public.) What do you do?"),
        choices: [
          { label: L("代わりに前へ出て、支える", "Step up in her place and back her up"), apply: (st) => { addLove(st, lead, 6); pushLog(st, L("個別STORY：NAOをそっと支えた（愛情度+6）", "Personal STORY: quietly supported NAO (affection +6)")); },
            next: [solo(s, "backstage", lead, "normal", L("「……助かった。」ぼそりと、でも確かに。人見知りの天才が、少しだけ肩の力を抜いた。（愛情度+6）", "\"...You saved me.\" Muttered, but she meant it. The shy genius let the tension drain from her shoulders, just a little. (affection +6)"), "flash")] },
          { label: L("「お前の言葉で話せ」と促す", "\"Speak in your own words\" — urge her on"), apply: (st) => { addParam(st, "S", 1); addLove(st, lead, 3); pushLog(st, L("個別STORY：NAOが自分の言葉で語った（センス+1・愛情度+3）", "Personal STORY: NAO spoke in her own words (Songcraft +1 / affection +3)")); },
            next: [solo(s, "backstage", lead, "fired", L("「……俺の音楽は、俺の言葉だ。」たどたどしくも、芯のある一言。少し、殻が破れた。（センス+1・愛情度+3）", "\"...My music is my words.\" Halting, but with a core of steel. Her shell cracked, a little. (Songcraft +1 / affection +3)"), "flash")] },
        ],
      },
    ],
    indiefes: (s, lead) => [
      solo(s, "studio", lead, "sad", L("楽屋にNAO宛ての手紙。差出人は親族——「いつまでそんな騒音を。そろそろ目を覚ましなさい」。NAOの手が、微かに震えている。", "A letter for NAO in the green room. From her relatives——\"How long will you keep at that noise? It's time to wake up.\" NAO's hand is trembling faintly.")),
      {
        bg: "studio", chars: [{ member: lead, pos: "center", mood: "normal" }],
        text: L("音楽一家に生まれ、メタルを選んだことがずっと彼女のコンプレックスだ。どう声をかける？", "Born into a family of musicians, choosing metal has always been her private complex. What do you say?"),
        choices: [
          { label: L("「音で黙らせてやれ」と焚きつける", "\"Silence them with your sound\" — fire her up"), apply: (st) => { addParam(st, "S", 1); addLove(st, lead, 3); pushLog(st, L("個別STORY：NAOに火がついた（センス+1・愛情度+3）", "Personal STORY: lit a fire in NAO (Songcraft +1 / affection +3)")); },
            next: [solo(s, "studio", lead, "fired", L("「……ああ。俺の速弾きが、本物だって証明してやる。」瞳に、静かな炎。（センス+1・愛情度+3）", "\"...Yeah. I'll prove my shredding is the real thing.\" A quiet flame in her eyes. (Songcraft +1 / affection +3)"), "flash")] },
          { label: L("「気にするな。俺たちが家族だ」", "\"Don't mind them. We're your family.\""), apply: (st) => { addLove(st, lead, 6); st.bond = Math.min(100, st.bond + 4); pushLog(st, L("個別STORY：NAOに寄り添った（愛情度+6・結束+4）", "Personal STORY: stood by NAO (affection +6 / unity +4)")); },
            next: [solo(s, "studio", lead, "happy", L("「……そう、だな。ここが、俺の居場所か。」手紙をそっと畳んだ。（愛情度+6・結束+4）", "\"...Yeah. So this is where I belong.\" She quietly folded the letter away. (affection +6 / unity +4)"), "flash")] },
        ],
      },
    ],
    major: (s, lead) => [
      solo(s, "studio", "RYO", "sad", L("メジャーの担当が言う。「もっとキャッチーに。速弾きは減らして、売れる曲を」。NAOの眉がぴくりと動いた。", "The label rep says: \"Make it catchier. Less shredding, more songs that sell.\" NAO's brow twitched.")),
      {
        bg: "studio", chars: [{ member: lead, pos: "center", mood: "normal" }],
        text: L("有名になることより、理想の音を追ってきた天才肌。その理想を、曲げさせるか？", "A prodigy who chased her ideal sound over fame. Do you make her bend that ideal?"),
        choices: [
          { label: L("「理想を貫け。それがお前だ」", "\"Stick to your ideal. That's who you are.\""), apply: (st) => { addParam(st, "S", 2); addLove(st, lead, 8); pushLog(st, L("個別STORY：NAOは理想を貫いた（センス+2・愛情度+8）", "Personal STORY: NAO held to her ideal (Songcraft +2 / affection +8)")); },
            next: [solo(s, "studio", lead, "fired", L("「……ありがとう。俺は、俺の音でてっぺんを獲る。」迷いが消えた指先が、加速する。（センス+2・愛情度+8）", "\"...Thank you. I'll take the top with my own sound.\" Doubt gone, her fingers accelerate. (Songcraft +2 / affection +8)"), "flash")] },
          { label: L("「売れ線も、武器のうちだ」", "\"Commercial appeal is a weapon too.\""), apply: (st) => { st.fame = Math.min(100, st.fame + 4); addLove(st, lead, 2); st.bond = Math.max(0, st.bond - 3); pushLog(st, L("個別STORY：NAOは折り合いをつけた（知名度+4・愛情度+2・結束-3）", "Personal STORY: NAO found a compromise (fame +4 / affection +2 / unity -3)")); },
            next: [solo(s, "studio", lead, "normal", L("「……一理ある。理想も、届かなきゃ意味がない、か。」複雑な顔で、新しい譜面を睨む。（知名度+4・愛情度+2・結束-3）", "\"...You've got a point. An ideal means nothing if it doesn't reach anyone, huh.\" Conflicted, she glares at the new sheet music. (fame +4 / affection +2 / unity -3)"), "flash")] },
        ],
      },
    ],
    bigfes: (s, lead) => [
      solo(s, "venueBig", lead, "happy", L("客席の隅に、あの親族の姿。演奏後、彼らは何も言わず、ただ深く頷いて帰っていった。\n\n「……認めさせた、のかな。」NAOの横顔が、憑き物が落ちたように穏やかだった。", "In a corner of the crowd — those relatives. After the set, they said nothing, just nodded deeply and left.\n\n\"...Did I make them accept it, I wonder.\" NAO's profile was calm, as if a weight had lifted."), "flash"),
    ],
  },
  Ba: {
    gateway: (s, lead) => [
      solo(s, "street", lead, "happy", L("MAKOのインディーズ知識が火を噴く。「あのハコの店長、昔◯◯ってバンドで…」——マニアックな縁が、思わぬ対バンを呼び込んだ。（人脈+1）", "MAKO's deep indie knowledge catches fire. \"That venue's owner used to be in a band called ◯◯...\"——an obscure connection lands an unexpected joint gig. (contacts +1)")),
      { bg: "street", chars: [{ member: lead, pos: "center", mood: "normal" }], text: L("地味だが、彼女の愛と知識がバンドを一歩前へ進めた。", "Understated, but her love and knowledge moved the band one step forward."), fx: "flash", choices: undefined },
    ],
    indiefes: (s, lead) => [
      solo(s, "studio", lead, "sad", L("ふとしたとき、MAKOがぽつりと零す。「……あたし、売れなくてもいい。ただ、このバンドが、いつか終わっちゃうのが、こわい」", "Out of nowhere, MAKO murmurs. \"...I don't care about making it big. I'm just scared this band will end someday.\"")),
      {
        bg: "studio", chars: [{ member: lead, pos: "center", mood: "normal" }],
        text: L("一番バンドにかける思いが強い、内気なベーシスト。何と返す？", "The shy bassist who cares about the band more than anyone. What do you say back?"),
        choices: [
          { label: L("「ずっと一緒だ。約束する」", "\"We're together forever. I promise.\""), apply: (st) => { st.bond = Math.min(100, st.bond + 10); addLove(st, lead, 8); pushLog(st, L("個別STORY：MAKOと約束を交わした（結束+10・愛情度+8）", "Personal STORY: made a promise with MAKO (unity +10 / affection +8)")); },
            next: [solo(s, "studio", lead, "happy", L("「……うん。うん。指切り、して？」小さな小指が差し出される。ずっと、この音を。（結束+10・愛情度+8）", "\"...Mm. Mm. Pinky promise?\" A small pinky reaches out. This sound, forever. (unity +10 / affection +8)"), "flash")] },
          { label: L("「先は分からない。でも今を全力で」", "\"No one knows the future. But we give our all to now.\""), apply: (st) => { addLove(st, lead, 4); st.bond = Math.min(100, st.bond + 4); pushLog(st, L("個別STORY：MAKOと今を誓った（愛情度+4・結束+4）", "Personal STORY: vowed to live the present with MAKO (affection +4 / unity +4)")); },
            next: [solo(s, "studio", lead, "normal", L("「……そうだね。今を、ちゃんと刻もう。」少し寂しげに、でも確かに頷いた。（愛情度+4・結束+4）", "\"...You're right. Let's carve out the present properly.\" A little wistful, but she nodded firmly. (affection +4 / unity +4)"), "flash")] },
        ],
      },
    ],
    major: (s, lead) => [
      solo(s, "venueBig", lead, "sad", L("規模が大きくなるほど、MAKOは不安げだ。「……大きくなると、みんな、変わっちゃうのかな」", "The bigger things get, the more anxious MAKO looks. \"...When we get big, does everyone end up changing?\"")),
      {
        bg: "studio", chars: [{ member: lead, pos: "center", mood: "normal" }],
        text: L("売れることより、このメンバーで長く。彼女の願いに、どう応える？", "Longevity with these members over making it big. How do you answer her wish?"),
        choices: [
          { label: L("「何があっても、この五人で行く」", "\"No matter what, we go with these five.\""), apply: (st) => { st.bond = Math.min(100, st.bond + 12); addLove(st, lead, 8); pushLog(st, L("個別STORY：MAKOに絆を誓った（結束+12・愛情度+8）", "Personal STORY: vowed the bond to MAKO (unity +12 / affection +8)")); },
            next: [solo(s, "studio", lead, "happy", L("「……えへへ。じゃあ、あたし、どこまでもついていく。」不安が、笑顔にほどけた。（結束+12・愛情度+8）", "\"...Ehehe. Then I'll follow you anywhere.\" Her anxiety unraveled into a smile. (unity +12 / affection +8)"), "flash")] },
          { label: L("「大きくなるのも、悪くないぞ」", "\"Getting big isn't so bad, you know.\""), apply: (st) => { st.fame = Math.min(100, st.fame + 4); st.bond = Math.max(0, st.bond - 4); addLove(st, lead, 1); pushLog(st, L("個別STORY：規模拡大を優先（知名度+4・結束-4）", "Personal STORY: prioritized growth (fame +4 / unity -4)")); },
            next: [solo(s, "street", lead, "sad", L("「……うん、わかってる。ついていく、けど。」少しだけ、俯いた。（知名度+4・結束-4）", "\"...Yeah, I know. I'll follow, but.\" She looked down, just a little. (fame +4 / unity -4)"))] },
        ],
      },
    ],
    bigfes: (s, lead) => [
      solo(s, "venueBig", lead, "happy", L("大観衆の中、MAKOがはにかんで叫んだ。「あたし、このバンドが世界で一番好き——ッ！」\n\n内気な彼女の、精一杯の愛の告白。四人の音が、一つに溶けていく。", "Amid the huge crowd, MAKO shyly cried out. \"I love this band more than anything in the world——!\"\n\nThe shy girl's all-out confession of love. The four of their sounds melt into one."), "flash"),
    ],
  },
  Dr: {
    gateway: (s, lead) => [
      solo(s, "backstage", lead, "sad", L("登竜門ライブ直前。天真爛漫なTOMOが、ガチガチに固まっている。「む、無理かも……人がいっぱい……」——実は、極度の上がり性なのだ。", "Right before the proving-ground show. The usually carefree TOMO is stiff as a board. \"I-I might not be able to do this... so many people...\"——turns out she gets stage fright, badly.")),
      {
        bg: "backstage", chars: [{ member: lead, pos: "center", mood: "normal" }],
        text: L("本番はもう目前。どう送り出す？", "Showtime is moments away. How do you send her out?"),
        choices: [
          { label: L("深呼吸させて、落ち着かせる", "Have her breathe deep and calm down"), apply: (st) => { addStamina(st, 6); addLove(st, lead, 6); pushLog(st, L("個別STORY：TOMOを落ち着かせた（体力+6・愛情度+6）", "Personal STORY: calmed TOMO down (stamina +6 / affection +6)")); },
            next: [solo(s, "backstage", lead, "happy", L("「……すぅ、はぁ。……うん、いける気がしてきた！ ありがと！」いつもの笑顔が戻った。（体力+6・愛情度+6）", "\"...Innn, ouut. ...Yeah, I think I've got this! Thanks!\" Her usual smile came back. (stamina +6 / affection +6)"), "flash")] },
          { label: L("「陸上の本番と同じだ、走れ！」", "\"Same as a track meet — now run!\""), apply: (st) => { addParam(st, "P", 2); addLove(st, lead, 3); pushLog(st, L("個別STORY：TOMOに気合が入った（パフォーマンス+2・愛情度+3）", "Personal STORY: pumped TOMO up (Performance +2 / affection +3)")); },
            next: [solo(s, "backstage", lead, "fired", L("「……っ、そうだ、スタートの合図と同じ！ よぉし、走るよ——ッ!!」スティックを握り直す。（パフォーマンス+2・愛情度+3）", "\"...Ngh, right, it's just like the starting gun! Okay, here I gooo——!!\" She regrips her sticks. (Performance +2 / affection +3)"), "flash")] },
        ],
      },
    ],
    indiefes: (s, lead) => [
      solo(s, "venueSmall", lead, "happy", L("客席にTOMOの友達がぎっしり。「TOMO——ッ！」の声援が飛ぶ。誰とでも仲良くなれる彼女の人徳が、会場を温めた。（知名度が広がった）", "The crowd is packed with TOMO's friends. Cheers of \"TOMO——!\" fly out. Her gift for befriending anyone warmed up the whole venue. (fame spread wider)"), "flash"),
    ],
    major: (s, lead) => [
      solo(s, "street", "RYO", "normal", L("陸上のコーチがTOMOを訪ねてきた。「君、まだ間に合う。オリンピックを本気で狙わないか」——TOMOの夢は、メダルだ。", "TOMO's old track coach came to see her. \"There's still time for you. What do you say to seriously going for the Olympics?\"——TOMO's dream was a medal.")),
      {
        bg: "studio", chars: [{ member: lead, pos: "center", mood: "normal" }],
        text: L("（そういえば、あたし『走るためにドラム』始めたんだっけ…）バンドか、陸上か。彼女の背中を、どう押す？", "(Come to think of it, I started drumming 'to run faster'...) The band, or track. How do you nudge her forward?"),
        choices: [
          { label: L("「両方の夢、応援するよ」", "\"I'll cheer on both dreams.\""), apply: (st) => { addLove(st, lead, 10); st.bond = Math.min(100, st.bond + 3); pushLog(st, L("個別STORY：TOMOの両夢を応援（愛情度+10・結束+3）", "Personal STORY: cheered on both of TOMO's dreams (affection +10 / unity +3)")); },
            next: [solo(s, "studio", lead, "happy", L("「……ほんと！？ えへへ、あたし、欲張りでもいいんだ！ ドラムも走るのも、全部やる——ッ！」（愛情度+10・結束+3）", "\"...Really!? Ehehe, so I'm allowed to be greedy! Drumming, running — I'll do it all——!\" (affection +10 / unity +3)"), "flash")] },
          { label: L("「今は、バンドに集中してほしい」", "\"For now, I want you focused on the band.\""), apply: (st) => { st.bond = Math.min(100, st.bond + 8); addLove(st, lead, -2); pushLog(st, L("個別STORY：TOMOにバンド集中を頼んだ（結束+8・愛情度-2）", "Personal STORY: asked TOMO to focus on the band (unity +8 / affection -2)")); },
            next: [solo(s, "studio", lead, "sad", L("「……うん、わかった。今は、みんなとが一番だもんね。」笑顔の奥に、ほんの少しの迷い。（結束+8・愛情度-2）", "\"...Yeah, got it. Right now, being with everyone comes first.\" A faint hesitation behind her smile. (unity +8 / affection -2)"))] },
        ],
      },
    ],
    bigfes: (s, lead) => [
      solo(s, "venueBig", lead, "happy", L("大歓声の中、TOMOがからっと笑う。「あたし、そろそろ気づいちゃった。ドラム、たぶん足は速くならない！ でも——こんなに好きになれたんだから、ぜんぜんアリ！」\n\n嘘から始まった夢が、本物になった瞬間。", "Amid the roar, TOMO laughs brightly. \"I'm starting to realize — drumming probably won't make me run faster! But — I got to love it this much, so it's totally worth it!\"\n\nThe moment a dream that started from a lie became real."), "flash"),
    ],
  },
};

/** Story beat for the chosen leader when checkpoint `clearedId` is cleared. */
export function buildLeaderStoryBeat(state: GameState, clearedId: string): Scene[] {
  const build = LEADER_ARC[state.leaderPart]?.[clearedId];
  if (!build) return [];
  return build(state, leaderArt(state), nameOf(state, leaderArt(state)));
}

export function buildOpeningScenes(state: GameState): Scene[] {
  return [
    ...buildLeaderIntro(state),
    scene("studio", ["KEN", "RYO", "MIO", "GO"], L("仲間はいる。時間も金も、いつだって足りない。それでも今日も、あたしたちはスタジオに集まる。\n\n——さあ、伝説を始めよう。", "We've got each other. Time and money are always short. And yet, today again, we gather at the studio.\n\n——Come on, let's start a legend."), { fx: "shake" }),
  ];
}

/** Tutorial: the band explains which action raises which stat. */
export function buildTutorialScenes(): Scene[] {
  return [
    scene("studio", ["KEN"], L("【遊び方】毎ターン、手札から行動を1つ選ぶ。まずは最初のライブまで、俺たちが手順を案内する。画面の説明どおりに動かしてみてくれ。", "[How to play] Each turn, pick one action from your hand. Up to your first live, we'll walk you through it step by step — just follow the on-screen coaching."), { speaker: "KEN" }),
    scene("venueSmall", ["KEN", "RYO", "MIO", "GO"], L("そして『関門』。期限までに条件（演奏力・ファン・曲数・結束・知名度など）を満たせば次のステージへ。間に合わなければ……解散だ。画面上部のチェックリストで、足りない数値を確認しよう。", "And then the 'Checkpoints'. Meet the conditions (musicianship, fans, songs, unity, fame, etc.) by the deadline to advance. Miss it, and... the band breaks up. Watch the checklist at the top for whatever's falling short."), { fx: "flash" }),
  ];
}

/** Milestone intro: protagonist + band get hyped for the next checkpoint. */
export function buildMilestoneIntro(state: GameState, m: Milestone): Scene[] {
  const lead = leaderArt(state);
  const name = nameOf(state, lead);
  return [
    scene(m.bg, ["KEN", "RYO", "MIO", "GO"], L(`【次の関門】${m.label}\n\n${m.intro}`, `[Next Checkpoint] ${m.label}\n\n${m.intro}`), { speaker: name }),
    scene("studio", [lead], L(`期限は${m.deadline}ヶ月目。条件は ${reqSummary(m)}。\n\n——やってやる。次のステージへ、駆け上がるぞ。`, `Deadline: month ${m.deadline}. Requirements: ${reqSummary(m)}.\n\n——We'll pull this off. Onward and up to the next stage.`), { fx: "flash" }),
  ];
}

/** Full intro sequence after part select: monologue + tutorial + first goal. */
/** Band-formation highlight (played right after the leader's backstory). */
export function buildFormationScenes(state: GameState): Scene[] {
  const lead = leaderArt(state);
  return [
    scene("street", ["RYO", "KEN", "MIO", "GO"], L("——それぞれが、燻っていた。学校で、バイト先で、路上で。行き場のない衝動を抱えて。", "——Each of them was smoldering. At school, at part-time jobs, on the street. Carrying an urge with nowhere to go."), { fx: "flash" }),
    scene("studio", ["RYO", "KEN", "MIO", "GO"], L("バラバラだった４人が、一本の轟音で繋がった日。誰かが鳴らしたリフに、残りの全員が音を重ねた。", "The day four scattered people were joined by a single roar. To a riff someone struck, all the rest layered their sound."), { fx: "shake" }),
    scene("studio", ["RYO", "KEN", "MIO", "GO"], L("「このメンツで、てっぺん獲るぞ」——社会人メタルバンド「Metal Road」、ここに結成！", "\"With this crew, we're taking the top.\"——the working-adult metal band \"Metal Road\" is formed, right here!"), { speaker: nameOf(state, lead), fx: "flash" }),
  ];
}

/** Per-member intro: part, personality, signature stats. Leader is tagged. */
const MEMBER_BLURB: Record<string, { tag: string; mood: Mood; stat: string; line: string }> = {
  RYO: { tag: L("Vo / ボーカル", "Vo / Vocals"), mood: "fired", stat: L("パフォーマンス・ビジュ力", "Performance & Looks"), line: L("喉ひとつで会場を掌握するカリスマ・フロントウーマン。目立ちたがりで、いつも本気の一歩手前……らしい。", "A charismatic frontwoman who commands a venue with her voice alone. A born show-off, always one step short of full seriousness... supposedly.") },
  KEN: { tag: L("Gt / ギター", "Gt / Guitar"), mood: "normal", stat: L("演奏基礎・音楽センス", "Musicianship & Songcraft"), line: L("理想の音を追い求めるクールな職人肌。速弾きとリフ作りにかけては一切妥協しない。", "A cool, craftsman-type who chases her ideal sound. When it comes to shredding and riff-writing, she never compromises.") },
  MIO: { tag: L("Ba / ベース", "Ba / Bass"), mood: "normal", stat: L("演奏基礎・音楽センス", "Musicianship & Songcraft"), line: L("無口だが芯は誰より熱い。地を這う低音で、バンドの土台を静かに支える。", "Quiet, but hotter at the core than anyone. With low end that crawls along the ground, she quietly holds up the band's foundation.") },
  GO: { tag: L("Dr / ドラム", "Dr / Drums"), mood: "happy", stat: L("演奏基礎・体力", "Musicianship & Stamina"), line: L("元・陸上部のパワフルドラマー。とにかく元気で、手数の暴力でバンドを前へ引っぱる。", "An ex-track-team powerhouse drummer. Relentlessly energetic, she drags the band forward with sheer barrages of hits.") },
};

/** Introduce all four members (Vo→Gt→Ba→Dr), tagging the player's own. */
export function buildMemberIntros(state: GameState): Scene[] {
  return ["RYO", "KEN", "MIO", "GO"].map((art) => {
    const m = state.members.find((x) => x.artKey === art)!;
    const b = MEMBER_BLURB[art];
    const you = m.isLeader ? L("（＝あなた）", " (= You)") : "";
    return solo(state, "studio", art, b.mood, L(`【${b.tag}】${nameOf(state, art)}${you}\n\n${b.line}\n\n★得意ステータス：${b.stat}`, `[${b.tag}] ${nameOf(state, art)}${you}\n\n${b.line}\n\n★ Signature stats: ${b.stat}`), "flash");
  });
}

/** Stat primer: explain the four params, which audience they serve, and stamina. */
export function buildStatPrimer(state: GameState): Scene[] {
  const lead = leaderArt(state);
  return [
    scene("studio", [lead], L("【能力の見かた】メンバーは４つの能力を持つ。\n\n🥁 演奏基礎(T)…土台の演奏力／🎤 パフォーマンス(P)…ステージでの魅せ／🎼 音楽センス(S)…曲・アレンジの質／🖤 ビジュ力(V)…見た目の華。", "[Reading the stats] Each member has four abilities.\n\n🥁 Musicianship (T)... core playing ability / 🎤 Performance (P)... stage presence / 🎼 Songcraft (S)... song & arrangement quality / 🖤 Looks (V)... visual flair."), { fx: "flash" }),
    scene("studio", [lead], L("客層によって刺さる能力は違う。\n\nコア＝演奏基礎＆センス／玄人＝演奏基礎＆センス／ビジュ＝ビジュ力＆パフォ／ライト＝パフォ＆ビジュ。狙う客層に合わせて能力を伸ばすのがコツだ。", "Different audiences respond to different abilities.\n\nCore = Musicianship & Songcraft / Connoisseur = Musicianship & Songcraft / Visual = Looks & Performance / Casual = Performance & Looks. The trick is to grow abilities to match the audience you're targeting.")),
    scene("studio", [lead], L("そして ⚡体力。行動するほど消耗し、尽きると「休息」しか選べなくなる。無理は禁物——休むのも立派な戦略だ。", "And then ⚡ stamina. The more you act, the more it drains, and when it runs out you can only pick 'Rest.' Don't push it——resting is a solid strategy too."), { fx: "flash" }),
  ];
}

/** Rating-specific reaction right after a live result (before the after-party).
 *  S: an industry person visits / A: SNS blows up / B: light banter / C-: gloom. */
export function buildLiveReactionScenes(state: GameState, r: LiveResult, rng: () => number = Math.random): Scene[] {
  const crew = ["RYO", "KEN", "MIO", "GO"];
  const lineup = (mood: Mood): Scene["chars"] =>
    crew.map((a, i) => ({ member: a, pos: (["left", "center", "right", "left"] as const)[i], mood }));
  const sat = r.satisfaction;
  if (sat >= 80) {
    const sp = pick(rng, ["RYO", "GO"]);
    return [
      { bg: "backstage", chars: lineup("normal"), text: L("楽屋の扉がノックされる。入ってきたのは——名の知れた音楽関係者だ。", "There's a knock at the green room door. In walks——a well-known music-industry figure."), fx: "flash" },
      { bg: "backstage", chars: [{ member: sp, pos: "center", mood: "fired" }], speaker: nameOf(state, sp), text: L("「今のステージ、しびれたよ。……近いうち、いい話を持ってくる」\n\n名刺を置いて去っていった。今日の熱が、次の扉をこじ開けた。", "\"That set gave me chills. ...Soon, I'll bring you something good.\"\n\nThey left a business card and walked out. Tonight's heat pried open the next door."), fx: "flash" },
    ];
  }
  if (sat >= 70) {
    return [
      { bg: "backstage", chars: lineup("normal"), text: L("スマホを覗き込んだ全員が、思わず声を上げる。……SNSが、とんでもないことになっている。", "Everyone peering at their phones lets out a gasp. ...Social media is blowing up."), fx: "flash" },
      { bg: "backstage", chars: lineup("happy"), text: L("「バズってる！」「この切り抜き、伸びすぎでしょ！？」——今夜のライブが、確かに広がっていく。", "\"We're going viral!\" \"This clip's blowing up way too much!?\"——tonight's show is spreading for real."), fx: "flash" },
    ];
  }
  if (sat >= 55) {
    return [
      { bg: "backstage", chars: lineup("normal"), text: L("「ま、悪くないライブだったんじゃない？」いつもの調子で、軽口を叩き合う。手応えは、ぼちぼち。", "\"Well, wasn't a bad show, right?\" They trade banter as usual. The response was so-so.") },
    ];
  }
  const sp = pick(rng, ["KEN", "MIO"]);
  return [
    { bg: "backstage", chars: lineup("sad"), text: L("楽屋に、重い沈黙が流れる。誰も、なかなか口を開けない。", "A heavy silence settles over the green room. No one can quite bring themselves to speak.") },
    { bg: "backstage", chars: [{ member: sp, pos: "center", mood: "sad" }], speaker: nameOf(state, sp), text: L("「……次だ。次で、絶対に取り返す」\n\n悔しさを噛み殺して、静かに拳を握った。", "\"...Next time. Next time, we take it back for sure.\"\n\nSwallowing the frustration, they quietly clenched a fist.") },
  ];
}

export function buildIntroSequence(state: GameState): Scene[] {
  const first = MILESTONES[state.stage];
  return [
    ...buildOpeningScenes(state),
    ...buildFormationScenes(state),
    ...buildMemberIntros(state),
    ...buildStatPrimer(state),
    ...buildTutorialScenes(),
    ...(first ? buildMilestoneIntro(state, first) : []),
  ];
}

/** Current value of a requirement key (for the checklist). */
export function reqValue(s: GameState, key: keyof Milestone["req"]): number {
  switch (key) {
    case "power": return bandPower(s);
    case "fans": return s.totalFans;
    case "songs": return s.songs.length;
    case "bond": return Math.round(s.bond);
    case "fame": return Math.round(s.fame);
  }
  return 0;
}

export const REQ_LABEL: Record<keyof Milestone["req"], string> = {
  power: L("演奏力", "Musicianship"), fans: L("ファン", "Fans"), songs: L("曲数", "Songs"), bond: L("結束", "Unity"), fame: L("知名度", "Fame"),
};

const reqMet = (s: GameState, req: Milestone["req"]): boolean =>
  (Object.keys(req) as (keyof Milestone["req"])[]).every((k) => reqValue(s, k) >= (req[k] ?? 0));

/** The milestone the band is currently working toward (undefined = all cleared). */
export const currentMilestone = (s: GameState): Milestone | undefined => MILESTONES[s.stage];

export type ProgressResult =
  | { kind: "none" }
  | { kind: "advance" | "clear"; milestone: Milestone; scenes: Scene[] }
  | { kind: "gameover"; milestone: Milestone };

/**
 * Evaluate the current checkpoint at a month boundary: advance if its
 * conditions are met, disband if its deadline has passed unmet, else continue.
 */
export function checkProgress(state: GameState): ProgressResult {
  const target = MILESTONES[state.stage];
  if (!target) return { kind: "none" };
  if (reqMet(state, target.req)) {
    state.stage += 1;
    if (target.id === "major") state.rank = "major";
    pushLog(state, L(`★ ${target.label} 達成！`, `★ ${target.label} cleared!`));
    const cleared = state.stage >= MILESTONES.length;
    const next = MILESTONES[state.stage];
    const scenes: Scene[] = [
      scene(target.bg, ["KEN", "RYO", "MIO", "GO"], L(`【${target.label}】達成！\n\n${target.flavor}`, `[${target.label}] cleared!\n\n${target.flavor}`), { fx: "flash" }),
      // the chosen leader's personal arc advances at each checkpoint
      ...buildLeaderStoryBeat(state, target.id),
      // when a new checkpoint appears, introduce it and hype the band up
      ...(!cleared && next ? buildMilestoneIntro(state, next) : []),
    ];
    return { kind: cleared ? "clear" : "advance", milestone: target, scenes };
  }
  if (state.month > target.deadline) {
    pushLog(state, L(`${target.label} の期限（${target.deadline}ヶ月目）を過ぎた…。バンドは解散した。`, `The deadline for ${target.label} (month ${target.deadline}) passed... The band broke up.`));
    return { kind: "gameover", milestone: target };
  }
  return { kind: "none" };
}

export function pushLog(state: GameState, msg: string): void {
  state.log.unshift(msg);
  if (state.log.length > 40) state.log.pop();
}

/** Display name for a sprite key (leader may be renamed). */
export function nameOf(state: GameState, artKey: string): string {
  return state.members.find((m) => m.artKey === artKey)?.name ?? artKey;
}
