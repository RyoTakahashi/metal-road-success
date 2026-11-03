// Generate low/high energy crowd states conditioned on the chosen "mid" image,
// so the silhouette+penlight look and framing stay consistent for crossfading.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenAI } from "@google/genai";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = join(ROOT, "public/assets/stage");
const ai = new GoogleGenAI({ apiKey: (process.env.GEMINI_API_KEY||"").trim() });
const MODEL = process.env.IMAGE_MODEL || "gemini-3-pro-image-preview";

const refBuf = readFileSync(join(OUT, "crowd.mid.png")).toString("base64");
const ref = { inlineData: { mimeType: "image/png", data: refBuf } };

const STYLE = "Keep the EXACT same art style, camera viewpoint (from the stage looking at the audience from behind the crowd), wide banner framing, crowd density and the plain flat light-gray background as the reference image. Bold near-silhouette chibi fans with thick outlines and glowing penlights. NO stage, NO band, NO text. ";
const STATES = {
  "crowd.low": STYLE + "ENERGY = LOW/CALM: almost all arms DOWN at their sides, only a FEW penlights lit and dim, the crowd is quiet and still, waiting.",
  "crowd.high": STYLE + "ENERGY = MAXIMUM FRENZY: nearly EVERY fan throwing both arms and fists UP high, a huge number of bright vivid penlights raised, jumping, chaotic headbanging energy.",
};

for (const [name, prompt] of Object.entries(STATES)) {
  process.stdout.write(`generating ${name}... `);
  const res = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts: [{ text: "Generate an image. " + prompt }, ref] }],
    config: { responseModalities: ["IMAGE", "TEXT"] },
  });
  const img = (res.candidates?.[0]?.content?.parts||[]).find(p=>p.inlineData);
  if (!img) { console.log("NO IMAGE", res.candidates?.[0]?.finishReason); continue; }
  const buf = Buffer.from(img.inlineData.data, "base64");
  writeFileSync(join(OUT, name + ".png"), buf);
  console.log("ok", buf.length, "bytes");
}
console.log("done");
