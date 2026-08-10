// Batch-generate RISA's (artKey RYO) appearance-evolution PNGs from the
// compiled DNA prompts, using the same Gemini call as server.mjs. Run from
// anywhere; paths resolve against the repo root.
//
//   GEMINI_API_KEY=... node tools/image-mcp/gen-risa.mjs [evo.mood ...]
//
// Default targets: the four evolutions at `normal`. Each generation is
// conditioned on the base v2 sprite (and, for non-normal moods, that evo's own
// normal once it exists) so the lion-girl identity stays consistent.
// Writes public/assets/chars/ryo.v2.{evo}.{mood}.png.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenAI } from "@google/genai";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const MODEL = process.env.IMAGE_MODEL || "gemini-3-pro-image-preview";
const KEY = (process.env.GEMINI_API_KEY || "").trim();
if (!KEY || KEY.includes("${")) {
  console.error("GEMINI_API_KEY is not set.");
  process.exit(1);
}
const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };
const ai = new GoogleGenAI({ apiKey: KEY });

const prompts = JSON.parse(readFileSync(join(ROOT, "dna/prompts.generated.json"), "utf8"));
const EVOS = prompts.RYO.evolutions; // { goth: { expressions: { normal: {file,positive,negative} } } }

const BASE_REF = join(ROOT, "public/assets/chars/ryo.v2.normal.png");

// Targets: "evo.mood" pairs. Default = every evolution at normal.
const args = process.argv.slice(2);
const targets = args.length
  ? args.map((a) => a.split("."))
  : Object.keys(EVOS).map((evo) => [evo, "normal"]);

function refParts(paths) {
  return paths
    .filter((p) => existsSync(p))
    .map((p) => ({
      inlineData: {
        mimeType: MIME[extname(p).toLowerCase()] || "image/png",
        data: readFileSync(p).toString("base64"),
      },
    }));
}

async function genOne(evo, mood, attempt = 1) {
  const spec = EVOS[evo]?.expressions?.[mood];
  if (!spec) throw new Error(`no prompt for ${evo}.${mood}`);
  const outAbs = join(ROOT, "public/assets/chars", spec.file);
  const evoNormal = join(ROOT, "public/assets/chars", EVOS[evo].expressions.normal.file);
  // Reference: base sprite always; add this evo's normal for its other moods.
  const refs = [BASE_REF, ...(mood !== "normal" ? [evoNormal] : [])];
  const fullPrompt =
    spec.positive +
    // Sprite framing + clean-cutout control: full body on a plain flat backdrop
    // with NO baked scenery/aura, so background removal yields a crisp cutout.
    // (The per-look aura is applied in-game as an FX layer, like moods.)
    "\n\nFULL-BODY standing pose, head to toe, both feet fully visible at the very bottom edge, centered, not a bust or portrait crop." +
    "\n\nRender the character ISOLATED on a plain flat neutral light-gray studio backdrop. Absolutely NO scenery, stage, background smoke, haze, glow, sparkles, rose petals, flames, embers or floating particles behind the character — a clean empty backdrop only." +
    "\n\nKeep the SAME character identity as the reference image (lion ears/tail, golden-orange mane with a pink streak, amber eyes), changing only outfit and expression." +
    "\n\nAspect ratio: 2:3 (vertical)." +
    `\n\nAvoid: ${spec.negative}, cropped at the waist, cut-off legs, busy background, scenery, smoke, particles.`;
  const parts = [{ text: fullPrompt }, ...refParts(refs)];
  const res = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts }],
    config: { responseModalities: ["IMAGE", "TEXT"] },
  });
  const outParts = res?.candidates?.[0]?.content?.parts || [];
  const img = outParts.find((p) => p.inlineData?.data);
  if (!img) {
    const txt = outParts.find((p) => p.text)?.text || "no image returned";
    if (attempt < 3) {
      console.warn(`  retry ${evo}.${mood} (attempt ${attempt}): ${txt.slice(0, 80)}`);
      await new Promise((r) => setTimeout(r, 1500 * attempt));
      return genOne(evo, mood, attempt + 1);
    }
    throw new Error(`no image for ${evo}.${mood}: ${txt}`);
  }
  mkdirSync(dirname(outAbs), { recursive: true });
  writeFileSync(outAbs, Buffer.from(img.inlineData.data, "base64"));
  console.log(`  ✓ ${spec.file}`);
}

console.log(`model=${MODEL}  targets=${targets.map((t) => t.join(".")).join(", ")}`);
for (const [evo, mood] of targets) {
  process.stdout.write(`gen ${evo}.${mood} ... \n`);
  await genOne(evo, mood);
}
console.log("done");
