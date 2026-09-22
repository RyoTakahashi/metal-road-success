// Extract every L("<ja>", "<en>") pair from the story-bearing source files and
// write a human-readable txt (Japanese primary, English secondary) for review.
// Handles both "..." and `...` literals and escaped quotes. Interpolations
// (${...}) are kept inline as written. Run: node scripts/dump-story.mjs
import fs from "node:fs";
import path from "node:path";

const FILES = [
  ["src/game/state.ts", "本編（イベント・会話・MC・打ち上げ・関門・個別STORY 等）"],
  ["src/game/flavor.ts", "演出フレーバー（練習・作曲・広報・休息・アイテム 等）"],
  ["src/game/narrative.ts", "ナラティブ"],
  ["src/game/tutorial.ts", "チュートリアル"],
  ["src/game/evolution.ts", "見た目の進化（名称・説明）"],
];

// Read a JS/TS string literal starting at src[i] (a quote char). Returns
// { value, end } where end is the index just past the closing quote.
function readString(src, i) {
  const quote = src[i];
  if (quote !== '"' && quote !== "'" && quote !== "`") return null;
  let out = "";
  let j = i + 1;
  while (j < src.length) {
    const c = src[j];
    if (c === "\\") { out += src[j + 1] ?? ""; j += 2; continue; }
    if (c === quote) return { value: out, end: j + 1 };
    out += c;
    j += 1;
  }
  return null;
}

// Skip whitespace/newlines.
function skipWs(src, i) { while (i < src.length && /\s/.test(src[i])) i += 1; return i; }

function extract(src) {
  const rows = [];
  for (let i = 0; i < src.length; i++) {
    // Match an L( call not preceded by an identifier char (so it's the L helper).
    if (src[i] === "L" && src[i + 1] === "(" && !/[A-Za-z0-9_$]/.test(src[i - 1] ?? " ")) {
      let k = skipWs(src, i + 2);
      const ja = readString(src, k);
      if (!ja) continue;
      k = skipWs(src, ja.end);
      if (src[k] !== ",") continue;
      k = skipWs(src, k + 1);
      const en = readString(src, k);
      if (!en) continue;
      const line = src.slice(0, i).split("\n").length;
      rows.push({ line, ja: ja.value, en: en.value });
      i = en.end;
    }
  }
  return rows;
}

const root = process.cwd();
let out = "";
out += "Metal Road — ストーリーテキスト一覧（目検用）\n";
out += `生成: ${new Date().toISOString()}\n`;
out += "各行: [行番号] 日本語 ／ English。${...} はゲーム内で数値等に置換されます。\n";
out += "※ ボタンや効果表示など一部UI文言も含みます。\n";
out += "=".repeat(78) + "\n";

let total = 0;
for (const [rel, title] of FILES) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) continue;
  const src = fs.readFileSync(p, "utf8");
  const rows = extract(src);
  total += rows.length;
  out += `\n\n■■■ ${title}  (${rel} / ${rows.length}件) ■■■\n\n`;
  for (const r of rows) {
    out += `[${String(r.line).padStart(4)}] ${r.ja}\n`;
    out += `       ┗ ${r.en}\n`;
  }
}
out += `\n${"=".repeat(78)}\n合計 ${total} 文\n`;

const dest = path.join(root, "story-text.txt");
fs.writeFileSync(dest, out, "utf8");
console.log(`Wrote ${dest} (${total} strings)`);
