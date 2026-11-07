import { writeFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenAI } from "@google/genai";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = join(ROOT, "public/assets/stage");
const ai = new GoogleGenAI({ apiKey: (process.env.GEMINI_API_KEY||"").trim() });
const MODEL = process.env.IMAGE_MODEL || "gemini-3-pro-image-preview";
const STYLE = "Art style: chibi anime prop, flat color cel shading, thick clean black outlines, bold saturated colors, cute video-game asset. Front view, straight-on, centered, sitting on the ground. ";
const NOTEXT = " ABSOLUTELY NO text, NO letters, NO words, NO numbers, NO logos or brand names anywhere on it — completely blank surfaces.";
const BG = " Isolated on a plain flat solid light-gray (#b5b5b5) background — no scenery, no shadow, no characters, no text.";
const GEAR = {
  "gear-amp": STYLE + "A single black guitar amplifier stack / speaker cabinet with a few silver knobs on top and a grille cloth front. Plain, blank — no branding." + NOTEXT + BG,
  "gear-drumkit": STYLE + "A compact rock drum kit from the front: big bass drum in the middle with a PLAIN BLANK white head, two mounted toms, a snare, two golden cymbals on stands, chrome hardware, dark red shells." + NOTEXT + BG,
};
for (const [name, prompt] of Object.entries(GEAR)) {
  process.stdout.write(name+"... ");
  const res = await ai.models.generateContent({ model: MODEL, contents: [{ role:"user", parts:[{ text:"Generate an image. "+prompt }] }], config:{ responseModalities:["IMAGE","TEXT"] } });
  const img = (res.candidates?.[0]?.content?.parts||[]).find(p=>p.inlineData);
  if(!img){ console.log("NO IMAGE"); continue; }
  writeFileSync(join(OUT,name+".png"), Buffer.from(img.inlineData.data,"base64")); console.log("ok");
}
