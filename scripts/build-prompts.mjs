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

/** Compose the positive + negative prompt for one expression. */
function compose(char, mood) {
  const positive = [
    ...style.style,
    ...char.identity,
    ...char.outfit,
    ...(char.props ?? []),
    `${char.part} of a metal band`,
    char.personality_vibe,
    char.expressions[mood],
    ...style.quality,
  ]
    .filter(Boolean)
    .join(", ");
  const negative = [...style.negatives_global, ...(char.negatives ?? [])].join(", ");
  return { positive, negative };
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
  for (const mood of Object.keys(char.expressions)) {
    const { positive, negative } = compose(char, mood);
    const outName = style.output.naming
      .replace("{id}", char.id.toLowerCase())
      .replace("{version}", char.version)
      .replace("{expression}", mood);
    out[char.id].expressions[mood] = { file: outName, positive, negative };
    md += `### ${mood} → \`${outName}\`\n`;
    md += "**prompt**\n```text\n" + positive + "\n```\n";
    md += "**negative**\n```text\n" + negative + "\n```\n\n";
  }
}

writeFileSync(join(dnaDir, "prompts.generated.md"), md);
writeFileSync(join(dnaDir, "prompts.generated.json"), JSON.stringify(out, null, 2) + "\n");
console.log(
  `Compiled ${charFiles.length} characters -> dna/prompts.generated.md, dna/prompts.generated.json`,
);
