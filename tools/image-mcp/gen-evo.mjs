// Member-aware batch generator for appearance-evolution art. Same Gemini call
// and sprite-framing controls as gen-risa.mjs, but for any member.
//
//   GEMINI_API_KEY=... node tools/image-mcp/gen-evo.mjs <MEMBER> [evo.mood ...]
//   e.g. node tools/image-mcp/gen-evo.mjs KEN goth.normal hard.normal
//
// MEMBER is a sprite artKey (RYO/KEN/MIO/GO). Default targets = that member's
// evolutions at `normal`. Each render is conditioned on the member's base v2
// sprite (and, for non-normal moods, that evo's own normal) for consistency.
// Writes public/assets/chars/{member}.v2.{evo}.{mood}.png (opaque; run cutout.py
// afterwards for the transparent sprite).

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenAI } from "@google/genai";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const MODEL = process.env.IMAGE_MODEL || "gemini-3-pro-image-preview";
const KEY = (process.env.GEMINI_API_KEY || "").trim();
if (!KEY || KEY.includes("${")) { console.error("GEMINI_API_KEY is not set."); process.exit(1); }
const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };
const ai = new GoogleGenAI({ apiKey: KEY });

const MEMBER = (process.argv[2] || "").toUpperCase();
const prompts = JSON.parse(readFileSync(join(ROOT, "dna/prompts.generated.json"), "utf8"));
const CHAR = prompts[MEMBER];
if (!CHAR?.evolutions) { console.error(`no evolutions for member '${MEMBER}'. Members: ${Object.keys(prompts).join(", ")}`); process.exit(1); }
const EVOS = CHAR.evolutions;
const lc = MEMBER.toLowerCase();
const BASE_REF = join(ROOT, `public/assets/chars/${lc}.v2.normal.png`);

const rest = process.argv.slice(3);
const targets = rest.length ? rest.map((a) => a.split(".")) : Object.keys(EVOS).map((e) => [e, "normal"]);

const refParts = (paths) =>
  paths.filter(existsSync).map((p) => ({
    inlineData: { mimeType: MIME[extname(p).toLowerCase()] || "image/png", data: readFileSync(p).toString("base64") },
  }));

async function genOne(evo, mood, attempt = 1) {
  const spec = EVOS[evo]?.expressions?.[mood];
  if (!spec) throw new Error(`no prompt for ${MEMBER} ${evo}.${mood}`);
  const outAbs = join(ROOT, "public/assets/chars", spec.file);
  const evoNormal = join(ROOT, "public/assets/chars", EVOS[evo].expressions.normal.file);
  const refs = [BASE_REF, ...(mood !== "normal" ? [evoNormal] : [])];
  const fullPrompt =
    spec.positive +
    "\n\nFULL-BODY standing pose, head to toe, both feet fully visible at the very bottom edge, centered, not a bust or portrait crop." +
    "\n\nSTRICTLY keep the SAME 2.5-head chibi proportions as the reference image: a very large head, a small stubby body and short legs (head ≈ 40% of total height) — do NOT make her taller, slimmer or more realistically proportioned." +
    "\n\nRender the character ISOLATED on a plain flat neutral light-gray studio backdrop. Absolutely NO scenery, stage, background smoke, haze, glow, sparkles, rose petals, flames, embers or floating particles behind the character — a clean empty backdrop only." +
    "\n\nKeep the SAME character identity (species ears/tail/hair and instrument) as the reference image, changing only outfit and expression." +
    "\n\nAspect ratio: 2:3 (vertical)." +
    `\n\nAvoid: ${spec.negative}, cropped at the waist, cut-off legs, tall slender body, realistic proportions, elongated legs, six-heads-tall, adult proportions, busy background, scenery, smoke, particles.`;
  const parts = [{ text: fullPrompt }, ...refParts(refs)];
  const res = await ai.models.generateContent({
    model: MODEL, contents: [{ role: "user", parts }], config: { responseModalities: ["IMAGE", "TEXT"] },
  });
  const outParts = res?.candidates?.[0]?.content?.parts || [];
  const img = outParts.find((p) => p.inlineData?.data);
  if (!img) {
    const txt = outParts.find((p) => p.text)?.text || "no image returned";
    if (attempt < 3) { console.warn(`  retry ${evo}.${mood} (${attempt}): ${txt.slice(0, 80)}`); await new Promise((r) => setTimeout(r, 1500 * attempt)); return genOne(evo, mood, attempt + 1); }
    throw new Error(`no image for ${MEMBER} ${evo}.${mood}: ${txt}`);
  }
  mkdirSync(dirname(outAbs), { recursive: true });
  writeFileSync(outAbs, Buffer.from(img.inlineData.data, "base64"));
  console.log(`  ✓ ${spec.file}`);
}

console.log(`member=${MEMBER} model=${MODEL} targets=${targets.map((t) => t.join(".")).join(", ")}`);
for (const [evo, mood] of targets) { process.stdout.write(`gen ${MEMBER} ${evo}.${mood} ...\n`); await genOne(evo, mood); }
console.log("done");
