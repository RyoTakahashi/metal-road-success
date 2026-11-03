// One-off: generate concert-audience art options for the live-stage screen.
// GEMINI_API_KEY=... node tools/image-mcp/gen-crowd.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenAI } from "@google/genai";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = join(ROOT, "public/assets/stage");
mkdirSync(OUT, { recursive: true });
const ai = new GoogleGenAI({ apiKey: (process.env.GEMINI_API_KEY||"").trim() });
const MODEL = process.env.IMAGE_MODEL || "gemini-3-pro-image-preview";

const STYLE = "Art style: chibi anime, flat color cel shading, thick clean black outlines, bold saturated colors, video-game art — matching a cute 2.5-head chibi character game. ";
const COMPO = "WIDE horizontal banner composition (about 16:6), the crowd fills the lower portion. The audience is seen FROM BEHIND (we are on stage looking out at them): backs of heads, shoulders and raised arms. A dense, lively metal-concert crowd. ";
const BG = "Plain flat solid light-gray background above/behind the crowd — NO stage, NO instruments, NO band, NO text, NO watermark, no gradient. Clean so the crowd can be cut out as a foreground layer.";

const OPTIONS = {
  "crowd-optA-mid": STYLE + COMPO + "Energy: MEDIUM — many fans with one fist or hand raised, some clapping, bobbing, cheerful. Colorful casual/band-tee outfits. " + BG,
  "crowd-optB-silhouette": STYLE + COMPO + "Rendered as bold near-SILHOUETTE fans (dark filled shapes with thick outlines) holding glowing penlights and raised fists, a few rim-light highlights, high-energy. " + BG,
};

for (const [name, prompt] of Object.entries(OPTIONS)) {
  process.stdout.write(`generating ${name}... `);
  const res = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts: [{ text: "Generate an image. " + prompt }] }],
    config: { responseModalities: ["IMAGE", "TEXT"] },
  });
  const img = (res.candidates?.[0]?.content?.parts||[]).find(p=>p.inlineData);
  if (!img) { console.log("NO IMAGE", res.candidates?.[0]?.finishReason); continue; }
  const buf = Buffer.from(img.inlineData.data, "base64");
  writeFileSync(join(OUT, name + ".png"), buf);
  console.log("ok", buf.length, "bytes");
}
console.log("done ->", OUT);
