// Compile character DNA YAML (dna/*.yaml) into ready-to-paste generation
// prompts. The YAML fields ARE the prompt — this script just orders + joins
// them with the shared style, per expression, with versioned output filenames.
//
//   npm run prompts
//
// Outputs: dna/prompts.generated.md (human) and dna/prompts.generated.json
// (machine, e.g. to drive a batch generator later).

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dnaDir = join(root, "dna");

const style = parse(readFileSync(join(dnaDir, "_style.yaml"), "utf8"));
const charFiles = readdirSync(dnaDir)
  .filter((f) => f.endsWith(".yaml") && !f.startsWith("_"))
  .sort();

/** Compose the positive + negative prompt for one expression.
 *  Pass an `evo` object to swap the base outfit for that evolution's `look`
 *  and append its `aura` — identity/props/part stay fixed (the constant core). */
function compose(char, mood, evo = null) {
  const positive = [
    ...style.style,
    ...char.identity,
    ...(evo ? evo.look : char.outfit),
    ...(char.props ?? []),
    `${char.part} of a metal band`,
    char.personality_vibe,
    char.expressions[mood],
    ...(evo?.aura ? [evo.aura] : []),
    ...style.quality,
  ]
    .filter(Boolean)
    .join(", ");
  const negative = [...style.negatives_global, ...(char.negatives ?? [])].join(", ");
  return { positive, negative };
}

/** Output filename, with an optional evolution infix
 *  (`ryo.v2.glam.fired.png`). Base art has no infix (`ryo.v2.fired.png`). */
function outName(char, mood, evoKey = "") {
  return style.output.naming
    .replace("{id}", char.id.toLowerCase())
    .replace("{version}", char.version)
    .replace("{expression}", evoKey ? `${evoKey}.${mood}` : mood);
}

let md = "# 生成プロンプト（dna/ から自動生成）\n\n";
md += "> `npm run prompts` で再生成。**このファイルは直接編集しない**（dna/*.yaml を編集）。\n\n";
md += `出力スペック: ${style.output.size} / ${style.output.format}\n\n`;

const out = {};
for (const file of charFiles) {
  const char = parse(readFileSync(join(dnaDir, file), "utf8"));
  out[char.id] = {
    version: char.version,
    part: char.part,
    generation: char.generation,
    expressions: {},
  };
  md += `## ${char.id}（${char.display_name} / ${char.part}） v${char.version}\n`;
  md += `- model: ${char.generation?.model || "(未設定)"} ／ seed: ${char.generation?.seed ?? "(未設定)"}\n\n`;
  const moods = Object.keys(char.expressions);
  for (const mood of moods) {
    const { positive, negative } = compose(char, mood);
    const name = outName(char, mood);
    out[char.id].expressions[mood] = { file: name, positive, negative };
    md += `### ${mood} → \`${name}\`\n`;
    md += "**prompt**\n```text\n" + positive + "\n```\n";
    md += "**negative**\n```text\n" + negative + "\n```\n\n";
  }

  // Appearance evolutions (optional): one look per unlocked audience layer,
  // reusing the same expression set on the fixed identity core.
  if (char.evolutions) {
    out[char.id].evolutions = {};
    for (const [key, evo] of Object.entries(char.evolutions)) {
      out[char.id].evolutions[key] = {
        label_ja: evo.label_ja,
        segment: evo.segment,
        expressions: {},
      };
      md += `### 🔥 進化: ${key}【${evo.label_ja ?? key}】（${evo.segment ?? "?"}層でS）\n\n`;
      for (const mood of moods) {
        const { positive, negative } = compose(char, mood, evo);
        const name = outName(char, mood, key);
        out[char.id].evolutions[key].expressions[mood] = { file: name, positive, negative };
        md += `#### ${key}.${mood} → \`${name}\`\n`;
        md += "**prompt**\n```text\n" + positive + "\n```\n";
        md += "**negative**\n```text\n" + negative + "\n```\n\n";
      }
    }
  }
}

writeFileSync(join(dnaDir, "prompts.generated.md"), md);
writeFileSync(join(dnaDir, "prompts.generated.json"), JSON.stringify(out, null, 2) + "\n");
console.log(
  `Compiled ${charFiles.length} characters -> dna/prompts.generated.md, dna/prompts.generated.json`,
);
