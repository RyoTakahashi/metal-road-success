// Generate FUSION evolution art: combine two (or more) single-genre looks into
// one outfit. Cumulative-evolution model — 2 unlocked layers = a pair fusion,
// 3+ = the "ultimate" look. Normal mood only for now.
//
//   GEMINI_API_KEY=... node tools/image-mcp/gen-combo.mjs <MEMBER> [combo ...]
//   combo = "hard-kawaii" (pair, infixes joined by "-") or "ultimate".
//   default combos = all 6 pairs + ultimate.
//
// Writes public/assets/chars/{member}.v2.{combo}.normal.png (opaque; run
// cutout.py afterwards). Conditioned on the base sprite + the involved single
// evolution sprites so identity and each parent look stay recognizable.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { GoogleGenAI } from "@google/genai";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const MODEL = process.env.IMAGE_MODEL || "gemini-3-pro-image-preview";
const KEY = (process.env.GEMINI_API_KEY || "").trim();
if (!KEY || KEY.includes("${")) { console.error("GEMINI_API_KEY not set"); process.exit(1); }
const ai = new GoogleGenAI({ apiKey: KEY });
const MIME = { ".png": "image/png", ".jpg": "image/jpeg" };

const MEMBER = (process.argv[2] || "").toUpperCase();
const ARTFILE = { RYO: "ryo", KEN: "ken", MIO: "mio", GO: "go" }[MEMBER];
if (!ARTFILE) { console.error(`member must be RYO/KEN/MIO/GO, got '${MEMBER}'`); process.exit(1); }
const yamlFile = { RYO: "ryo", KEN: "ken", MIO: "mio", GO: "go" }[MEMBER];
const style = parse(readFileSync(join(ROOT, "dna/_style.yaml"), "utf8"));
const char = parse(readFileSync(join(ROOT, `dna/${yamlFile}.yaml`), "utf8"));
const EVOS = char.evolutions; // keyed by infix: goth/hard/kawaii/death

const PAIRS = ["goth-hard", "goth-kawaii", "goth-death", "hard-kawaii", "hard-death", "kawaii-death"];
const combos = process.argv.slice(3).length ? process.argv.slice(3) : [...PAIRS, "ultimate"];

const sprite =
  "FULL-BODY standing pose, head to toe, both feet fully visible at the very bottom edge, centered, not a bust crop. " +
  "Render the character ISOLATED on a plain flat neutral light-gray studio backdrop — no scenery, smoke, haze, glow, sparkles, petals, flames or particles. Clean empty backdrop only.";

function refParts(paths) {
  return paths.filter(existsSync).map((p) => ({
    inlineData: { mimeType: MIME[p.slice(p.lastIndexOf("."))] || "image/png", data: readFileSync(p).toString("base64") },
  }));
}

function promptFor(combo) {
  const identity = char.identity.join(", ");
  const base = `${style.style.join(", ")}, ${identity}`;
  const tail = `, ${(char.props || []).join(", ")}, ${char.part} of a metal band, ${char.personality_vibe}, calm confident expression, ${style.quality.join(", ")}`;
  const neg = [...style.negatives_global, ...(char.negatives || []), "busy background, scenery, smoke, particles, cropped legs"].join(", ");

  let keys;
  if (combo === "ultimate") keys = ["goth", "hard", "kawaii", "death"];
  else keys = combo.split("-");

  const looks = keys.map((k) => `[${EVOS[k].label_ja}: ${EVOS[k].look.join(", ")}]`);
  const fusionText =
    combo === "ultimate"
      ? `wearing the ULTIMATE fusion that combines ALL of these metal looks into one elaborate legendary stage costume — take the most iconic element from each and blend them harmoniously: ${looks.join(" ")}. An over-the-top final-form metal queen; keep it a single coherent outfit, not a collage.`
      : `wearing a FUSION that blends these two metal looks into ONE coherent outfit — mix their key garments and accessories together, not split down the middle: ${looks.join(" AND ")}.`;

  const refs = [
    join(ROOT, `public/assets/chars/${ARTFILE}.v2.normal.png`),
    ...keys.map((k) => join(ROOT, `public/assets/chars/${ARTFILE}.v2.${k}.normal.png`)),
  ];
  const positive = `${base}, ${fusionText}${tail}\n\n${sprite}\n\nKeep the SAME character identity (species ears/tail/hair and instrument) as the reference images.\n\nAspect ratio: 2:3 (vertical).\n\nAvoid: ${neg}.`;
  return { positive, refs };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function gen(combo, attempt = 1) {
  const { positive, refs } = promptFor(combo);
  try {
    const res = await ai.models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts: [{ text: positive }, ...refParts(refs)] }],
      config: { responseModalities: ["IMAGE", "TEXT"] },
    });
    const img = (res?.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData?.data);
    if (!img) throw new Error("no image returned");
    const out = join(ROOT, `public/assets/chars/${ARTFILE}.v2.${combo}.normal.png`);
    writeFileSync(out, Buffer.from(img.inlineData.data, "base64"));
    console.log(`  ✓ ${ARTFILE}.v2.${combo}.normal.png`);
  } catch (e) {
    const rate = e?.status === 429 || /429|RESOURCE_EXHAUSTED/.test(String(e?.message));
    if (rate && attempt <= 6) { const w = 15000 * attempt; console.warn(`  429 ${combo}, wait ${w / 1000}s (#${attempt})`); await sleep(w); return gen(combo, attempt + 1); }
    if (attempt <= 2) { console.warn(`  retry ${combo}: ${String(e?.message).slice(0, 80)}`); await sleep(3000); return gen(combo, attempt + 1); }
    throw e;
  }
}

console.log(`member=${MEMBER} combos=${combos.join(", ")}`);
for (const c of combos) { process.stdout.write(`gen ${c}...\n`); await gen(c); await sleep(2500); }
console.log("done");
