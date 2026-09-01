// Hands-on tutorial for the very first live run-up. The opening VN sequence
// (buildIntroSequence) explains the systems in words; this drives the player
// through the actual actions, one per turn, with a coach note on each and the
// effect it produces. The hand is forced to the scripted card, and the board
// coach box explains why.
//
// Scripted turns:
//   Month 1, Turn 1 → Music: Practice (Musicianship)
//   Month 1, Turn 2 → Networking: New Contacts
//   Month 1, Turn 3 → Part-time Job
//   Month 1, Turn 4 → Promotion
//   (first live — the live screen carries its own explainer)
//   Month 2, Turn 1 → Rest
//   Month 2, Turn 2 → Music: Compose
// From Month 2, Turn 3 onward the game hands out random hands as normal.

import type { ActionKind, GameState, Param } from "./types";
import { L } from "./i18n";

export interface TutorialStep {
  card: ActionKind; // the single card the hand is forced to
  sub?: string; // the sub-action to auto-resolve (skips the sub menu)
  param?: Param; // the practice param, when the sub is "practice"
  coach: string; // artKey of the bandmate coaching this step
  step: string; // short "① Music: Practice" style tag
  body: string; // what to do + the effect it produces
}

/** Scripted steps keyed by `${month}-${turn}` (only during the first-live run-up). */
const STEPS: Record<string, TutorialStep> = {
  "1-1": {
    card: "music", sub: "practice", param: "T", coach: "KEN",
    step: L("① 音楽活動：練習", "① Music: Practice"),
    body: L(
      "まずは『音楽活動 ＞ 練習 ＞ 演奏基礎(T)』。全員の演奏基礎が +6 され、バンドの演奏力が底上げされる。コアや玄人の客層に刺さるようになる要の能力だ。スタジオ代¥8,000と体力を消費する。",
      "Start with 'Music > Practice > Musicianship (T)'. Every member's Musicianship goes up +6, lifting the whole band's power. It's the key stat for landing with Core and Connoisseur crowds. Costs ¥8,000 studio and some stamina.",
    ),
  },
  "1-2": {
    card: "network", sub: "contact", coach: "MIO",
    step: L("② 関係性構築：新たな人脈", "② Networking: New Contacts"),
    body: L(
      "次は『関係性構築 ＞ 新たな人脈』。人脈が +1、マーケ力と知名度が少し上がる。人脈が貯まると、メジャー昇格後にサポート陣（PA・マネージャーなど）を招けるようになる。",
      "Now 'Networking > New Contacts'. Contacts +1, with a small bump to marketing reach and fame. Build enough contacts and — once you go major — you can recruit support staff (PA, manager, and so on).",
    ),
  },
  "1-3": {
    card: "money", coach: "GO",
    step: L("③ アルバイト", "③ Part-time Job"),
    body: L(
      "『アルバイト』で¥40,000〜70,000を稼ぐ。ライブの会場費は前払いだから、その元手になる。稼ぐ月と鍛える月のバランスが大事だ。",
      "'Part-time Job' earns ¥40,000–70,000. Live venue fees are paid up front, so this is your seed money. Balancing earning months against training months matters.",
    ),
  },
  "1-4": {
    card: "promo", coach: "RYO",
    step: L("④ 広報活動", "④ Promotion"),
    body: L(
      "『広報活動』で知名度 +3、ファンがじわっと増え、SNS到達も上がる。知名度とファンはライブの動員に直結する。これで最初のライブの準備は整った！",
      "'Promotion' gives Fame +3, a trickle of new fans, and better SNS reach. Fame and fans feed straight into live attendance. That readies you for your first live!",
    ),
  },
  "2-1": {
    card: "rest", sub: "full", coach: "GO",
    step: L("⑤ 休息", "⑤ Rest"),
    body: L(
      "ライブお疲れさま！ 動き続けると体力を消耗する。『休息 ＞ 完全休養』で体力を大きく回復しよう。体力が尽きると休息しか選べなくなるから、無理は禁物だ。",
      "Nice work on the live! Acting nonstop drains stamina. Use 'Rest > Full Rest' to recover a lot of it. If stamina runs out you can only pick Rest, so don't overdo it.",
    ),
  },
  "2-2": {
    card: "music", sub: "compose", coach: "KEN",
    step: L("⑥ 音楽活動：作曲", "⑥ Music: Compose"),
    body: L(
      "『音楽活動 ＞ 作曲』で新曲を書く（録音費¥30,000）。どの客層に刺す曲か（〜寄り）を選び、タイトルを付ける。曲数は関門の条件にもなるし、時間が経つと曲は古びて効果が落ちるので、定期的に新曲を足していこう。",
      "'Music > Compose' writes a new song (¥30,000 recording). Choose which audience it leans toward, then a title. Song count is a checkpoint requirement, and songs go stale over time — so keep adding fresh ones.",
    ),
  },
};

/** The scripted tutorial step for the current (month, turn), or null when the
 *  hands-on tutorial is over. */
export function tutorialStepFor(state: GameState): TutorialStep | null {
  return STEPS[`${state.month}-${state.turn}`] ?? null;
}

/** True while a scripted tutorial turn is in progress (forced hand + coaching). */
export const tutorialActive = (state: GameState): boolean => tutorialStepFor(state) !== null;

/** The first live (end of Month 1) shows an extra explainer on the live screen. */
export const firstLiveTutorial = (state: GameState): boolean => state.month === 1;
