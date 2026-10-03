// Apply the user's edited story-text dump back into the source L("ja","en")
// literals. Matches entries positionally (same extractor/order as dump-story),
// rewrites only the args whose displayed text changed, preserving each literal's
// original quote. Entries whose source literal carries a risky escape (\n etc.)
// that the lossy dump flattened are SKIPPED and reported, never guessed.
import fs from "node:fs";

const UPLOAD = process.argv[2];
const FILES = [
  "src/game/state.ts",
  "src/game/flavor.ts",
  "src/game/narrative.ts",
  "src/game/tutorial.ts",
  "src/game/evolution.ts",
];

// --- read a string literal, returning quote + inner offsets (raw, un-decoded) ---
function readLit(src, i) {
  const quote = src[i];
  if (quote !== '"' && quote !== "'" && quote !== "`") return null;
  let j = i + 1;
  while (j < src.length) {
    const c = src[j];
    if (c === "\\") { j += 2; continue; }
    if (c === quote) return { quote, innerStart: i + 1, innerEnd: j, end: j + 1 };
    j += 1;
  }
  return null;
}
const skipWs = (s, i) => { while (i < s.length && /\s/.test(s[i])) i += 1; return i; };

// Reproduce dump-story's lossy display: drop the backslash before any escaped char.
function render(raw) {
  let out = "";
  for (let k = 0; k < raw.length; k++) {
    if (raw[k] === "\\") { out += raw[k + 1] ?? ""; k += 1; continue; }
    out += raw[k];
  }
  return out;
}
// Re-escape a NEW display value into a literal of the given quote.
function escapeFor(quote, text) {
  let out = "";
  for (const ch of text) {
    if (ch === "\\") out += "\\\\";
    else if (ch === quote) out += "\\" + quote;
    else out += ch;
  }
  return out;
}
// A literal is "risky" if it has an escape other than \" \` \\ (e.g. \n) that the
// lossy dump collapsed — we cannot safely reconstruct it from edited display text.
const risky = (raw) => /\\[^"`\\]/.test(raw);

function extract(src) {
  const rows = [];
  for (let i = 0; i < src.length; i++) {
    if (src[i] === "L" && src[i + 1] === "(" && !/[A-Za-z0-9_$]/.test(src[i - 1] ?? " ")) {
      let k = skipWs(src, i + 2);
      const ja = readLit(src, k);
      if (!ja) continue;
      k = skipWs(src, ja.end);
      if (src[k] !== ",") continue;
      k = skipWs(src, k + 1);
      const en = readLit(src, k);
      if (!en) continue;
      rows.push({ ja, en });
      i = en.end;
    }
  }
  return rows;
}

// --- parse the uploaded dump into { file: [{ja,en}, ...] } ---
const up = fs.readFileSync(UPLOAD, "utf8").split("\n");
const upByFile = {};
let curFile = null, pendingJa = null;
for (const line of up) {
  const h = line.match(/■■■ .*\((src\/[^\s)]+) \//);
  if (h) { curFile = h[1]; upByFile[curFile] = []; pendingJa = null; continue; }
  if (!curFile) continue;
  const ja = line.match(/^\[\s*\d+\]\s(.*)$/);
  if (ja) { pendingJa = ja[1]; continue; }
  const en = line.match(/^\s+┗ (.*)$/);
  if (en && pendingJa !== null) { upByFile[curFile].push({ ja: pendingJa, en: en[1] }); pendingJa = null; }
}

let applied = 0;
const skipped = [];
const mism = [];
for (const rel of FILES) {
  const src = fs.readFileSync(rel, "utf8");
  const rows = extract(src);
  const edits = upByFile[rel] || [];
  if (rows.length !== edits.length) { mism.push(`${rel}: source ${rows.length} vs upload ${edits.length}`); continue; }
  const patches = []; // {start,end,text}
  rows.forEach((r, idx) => {
    const e = edits[idx];
    for (const key of ["ja", "en"]) {
      const lit = r[key];
      const raw = src.slice(lit.innerStart, lit.innerEnd);
      const oldDisp = render(raw);
      const newDisp = e[key];
      if (oldDisp === newDisp) continue;
      if (risky(raw)) { skipped.push(`${rel} #${idx} ${key}: "${oldDisp}" -> "${newDisp}" (has \\n/escape)`); continue; }
      patches.push({ start: lit.innerStart, end: lit.innerEnd, text: escapeFor(lit.quote, newDisp) });
      applied += 1;
    }
  });
  if (patches.length) {
    patches.sort((a, b) => b.start - a.start); // apply right-to-left
    let out = src;
    for (const p of patches) out = out.slice(0, p.start) + p.text + out.slice(p.end);
    fs.writeFileSync(rel, out, "utf8");
  }
}

console.log(`applied ${applied} arg edits`);
if (mism.length) { console.log("COUNT MISMATCH:"); mism.forEach((m) => console.log("  " + m)); }
if (skipped.length) { console.log(`SKIPPED ${skipped.length} (risky escapes):`); skipped.forEach((s) => console.log("  " + s)); }
