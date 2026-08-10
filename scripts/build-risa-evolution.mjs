// Build RISA's 4 appearance-evolution standing-art PROTOTYPES as SVG.
//
//   node scripts/build-risa-evolution.mjs
//
// These are placeholder sprites (same role as public/assets/chars/*.svg) that
// preview each evolution look BEFORE the real per-evolution PNGs are generated.
// The identity core — lion ears/tail, golden-orange mane + pink streak, amber
// eyes, mic — is shared and held constant; only outfit / accessories / palette /
// aura change per look. Mirrors dna/ryo.yaml `evolutions` and the game's
// EVO_INFIX (glam=ビジュ / heavy=コア / pop=ライト / virtuoso=玄人).
//
// Outputs:
//   public/assets/chars/evolutions/ryo.v2.{evo}.svg   (4 reusable sprites)
//   public/risa-evolution.html                        (in-repo viewer, /risa-evolution.html)

import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public/assets/chars/evolutions");
mkdirSync(outDir, { recursive: true });

// ---- constant identity core (colors reused by every look) -------------------
const INK = "#1a1320";
const SKIN = "#ffe0c0";
const SKIN_SH = "#f4c79a";
const MANE = "#f0a63a"; // golden-orange
const MANE_SH = "#d98a26";
const EAR_IN = "#caa06a";
const PINK = "#ff4f8b"; // the signature streak
const AMBER = "#c9781f";

// ---------------------------------------------------------------------------
// Shared parts. Each returns an SVG fragment. Coordinates assume a 360x560
// canvas with a chibi (~2.5-head) figure centred on x=180.
// ---------------------------------------------------------------------------

// Big lion tail curling out to the right, tuft coloured by the look.
const tail = (tuft = MANE) => `
  <g stroke="${INK}" stroke-width="3" stroke-linejoin="round">
    <path d="M250 430 Q322 430 320 356 Q318 322 296 322 Q312 336 306 360 Q300 396 250 402 Z" fill="${MANE_SH}"/>
    <path d="M300 316 q22 -6 26 18 q4 24 -18 30 q14 -18 2 -34 q-6 -10 -10 -14 z" fill="${tuft}"/>
  </g>`;

// Mane behind the head + two lion ears. Pink streak lives on the right.
const maneAndEars = (mane = MANE, maneSh = MANE_SH, streak = PINK) => `
  <g stroke="${INK}" stroke-width="3" stroke-linejoin="round">
    <!-- ears -->
    <path d="M96 118 q-16 -54 26 -60 q30 -2 30 34 z" fill="${mane}"/>
    <path d="M118 96 q-6 -26 16 -30 q14 0 12 20 z" fill="${EAR_IN}" stroke="none"/>
    <path d="M264 118 q16 -54 -26 -60 q-30 -2 -30 34 z" fill="${mane}"/>
    <path d="M242 96 q6 -26 -16 -30 q-14 0 -12 20 z" fill="${EAR_IN}" stroke="none"/>
    <!-- mane blob -->
    <path d="M84 190 Q68 92 132 74 Q150 44 180 58 Q210 44 228 74 Q292 92 276 190
             Q300 248 270 292 L256 250 L246 292 L236 246 L224 292 L214 248 L202 292
             L192 246 L180 292 L168 246 L158 292 L146 248 L136 292 L126 246 L116 292
             L104 250 L90 292 Q60 248 84 190 Z" fill="${mane}"/>
    <!-- inner mane shading -->
    <path d="M110 176 Q104 250 118 288 L128 250 Q120 210 128 176 Z" fill="${maneSh}" stroke="none" opacity="0.55"/>
    <path d="M250 176 Q256 250 242 288 L232 250 Q240 210 232 176 Z" fill="${maneSh}" stroke="none" opacity="0.55"/>
    <!-- signature pink streak (right side) -->
    <path d="M236 120 Q262 150 250 250 L228 250 Q236 160 216 128 Z" fill="${streak}" stroke="none"/>
  </g>`;

// Head: skin, amber eyes, nose, grin. `makeup` is an optional overlay fragment.
const head = (makeup = "") => `
  <g stroke="${INK}" stroke-width="3" stroke-linejoin="round">
    <rect x="166" y="222" width="30" height="30" rx="8" fill="${SKIN_SH}"/>
    <circle cx="181" cy="168" r="72" fill="${SKIN}"/>
  </g>
  ${makeup}
  <g stroke="none">
    <!-- eyes -->
    <ellipse cx="153" cy="176" rx="12" ry="16" fill="#fff"/>
    <ellipse cx="209" cy="176" rx="12" ry="16" fill="#fff"/>
    <circle cx="154" cy="178" r="9" fill="${AMBER}"/>
    <circle cx="210" cy="178" r="9" fill="${AMBER}"/>
    <circle cx="151" cy="174" r="3" fill="#fff"/>
    <circle cx="207" cy="174" r="3" fill="#fff"/>
    <!-- brows + nose + confident grin -->
    <path d="M140 158 Q154 150 168 158" stroke="${INK}" stroke-width="3" fill="none"/>
    <path d="M194 158 Q208 150 222 158" stroke="${INK}" stroke-width="3" fill="none"/>
    <path d="M176 194 L186 194 L181 201 Z" fill="${SKIN_SH}"/>
    <path d="M162 208 Q181 224 200 208" stroke="${INK}" stroke-width="3" fill="none"/>
  </g>
  <!-- front mane bangs -->
  <g stroke="${INK}" stroke-width="3" stroke-linejoin="round">
    <path d="M112 150 Q120 96 181 92 Q242 96 250 150
             L232 128 L224 156 L206 122 L196 154 L181 118 L166 154 L156 122 L138 156 L130 128 Z"
          fill="${MANE}"/>
    <path d="M226 112 Q246 140 236 172 L220 150 Q230 130 214 116 Z" fill="${PINK}" stroke="none"/>
  </g>`;

// Vocal mic held up in the left hand near the face. `head`/`accent` recolour it.
const mic = (grip = SKIN, headCol = "#3a3a44", body = "#0e0e12") => `
  <g stroke="${INK}" stroke-width="3" stroke-linejoin="round">
    <line x1="118" y1="300" x2="150" y2="238" stroke="${body}" stroke-width="9"/>
    <circle cx="154" cy="230" r="16" fill="${headCol}"/>
    <circle cx="118" cy="300" r="15" fill="${grip}"/>
  </g>`;

// ---------------------------------------------------------------------------
// Per-look bodies. Torso ~y246→400, short chibi legs, feet ~y508.
// ---------------------------------------------------------------------------

const legsBare = () => `
  <path d="M150 396 L142 500 L172 500 L178 402 Z" fill="${SKIN}"/>
  <path d="M212 396 L200 402 L192 500 L222 500 L226 396 Z" fill="${SKIN}"/>`;

// GLAM — 妖艶グラム: magenta sequin corset dress, gold trim, jewels, heels.
function bodyGlam() {
  return `
  <g stroke="${INK}" stroke-width="3" stroke-linejoin="round">
    ${legsBare()}
    <!-- heeled boots -->
    <path d="M140 500 L138 528 L176 528 L176 500 Z" fill="#c9187a"/>
    <path d="M190 500 L190 528 L228 528 L226 500 Z" fill="#c9187a"/>
    <rect x="150" y="528" width="4" height="14" fill="${INK}"/>
    <rect x="210" y="528" width="4" height="14" fill="${INK}"/>
    <!-- corset dress -->
    <path d="M130 250 Q181 232 232 250 L252 372 Q181 356 110 372 Z" fill="#d63a8f"/>
    <path d="M132 300 Q181 288 230 300 L246 386 Q181 412 116 386 Z" fill="#b92a76"/>
    <!-- gold trim + lacing -->
    <path d="M130 250 Q181 232 232 250" stroke="#ffd257" stroke-width="5" fill="none"/>
    <path d="M118 366 Q181 348 244 366" stroke="#ffd257" stroke-width="4" fill="none"/>
    <line x1="181" y1="256" x2="181" y2="360" stroke="#ffd257" stroke-width="2"/>
    <!-- arms + gloves -->
    <path d="M132 256 L104 320 L128 330 L152 274 Z" fill="#e86bb0"/>
    <path d="M230 256 L256 322 L232 332 L210 274 Z" fill="#e86bb0"/>
    <circle cx="252" cy="330" r="14" fill="${SKIN}"/>
    <!-- gemstone choker -->
    <path d="M160 236 Q181 246 202 236" stroke="#ffd257" stroke-width="5" fill="none"/>
    <path d="M181 240 l7 9 l-7 9 l-7 -9 z" fill="#ff9ed6" stroke="#ffd257" stroke-width="1.5"/>
  </g>`;
}

// HEAVY — 重鋼ヘヴィ: spiked leather, chains, war-paint, steel-toe boots.
function bodyHeavy() {
  return `
  <g stroke="${INK}" stroke-width="3" stroke-linejoin="round">
    <path d="M150 396 L142 500 L172 500 L178 402 Z" fill="#171319"/>
    <path d="M212 396 L200 402 L192 500 L222 500 L226 396 Z" fill="#171319"/>
    <!-- steel-toe boots -->
    <path d="M136 500 L134 528 L178 528 L176 500 Z" fill="#0d0b10"/>
    <path d="M190 500 L190 528 L230 528 L226 500 Z" fill="#0d0b10"/>
    <path d="M136 520 L178 520 L178 528 L134 528 Z" fill="#9aa0ad"/>
    <path d="M190 520 L228 520 L230 528 L190 528 Z" fill="#9aa0ad"/>
    <!-- torn band tee -->
    <path d="M132 250 Q181 236 230 250 L240 398 L122 398 Z" fill="#231e29"/>
    <path d="M156 250 Q181 244 206 250 L206 372 L156 386 Z" fill="#7a1420"/>
    <!-- bullet belt -->
    <rect x="120" y="376" width="122" height="12" fill="#2b2620"/>
    <g fill="#d9b23a">${Array.from({length:8},(_,i)=>`<rect x="${126+i*14}" y="378" width="6" height="8" rx="2"/>`).join("")}</g>
    <!-- leather jacket with spiked shoulders -->
    <path d="M120 252 L96 372 L128 372 L140 268 Z" fill="#14121a"/>
    <path d="M242 252 L266 372 L234 372 L222 268 Z" fill="#14121a"/>
    <g fill="#c7ccd6">
      <path d="M112 250 l10 -14 l10 14 z"/><path d="M96 268 l10 -14 l10 14 z"/>
      <path d="M228 250 l10 -14 l10 14 z"/><path d="M244 268 l10 -14 l10 14 z"/>
    </g>
    <!-- chains -->
    <path d="M132 300 Q181 330 230 300" stroke="#aeb4bf" stroke-width="4" fill="none" stroke-dasharray="3 3"/>
    <!-- gauntlet hand + spiked collar -->
    <circle cx="106" cy="366" r="14" fill="#14121a"/>
    <circle cx="256" cy="366" r="14" fill="#14121a"/>
    <path d="M156 236 Q181 248 206 236 L206 244 Q181 256 156 244 Z" fill="#0d0b10"/>
    <g fill="#c7ccd6">${Array.from({length:5},(_,i)=>`<path d="M${162+i*10} 240 l4 -8 l4 8 z"/>`).join("")}</g>
  </g>`;
}

// POP — 煌ポップ: pastel idol outfit, ribbons, star clip, sneakers, star mic.
function bodyPop() {
  return `
  <g stroke="${INK}" stroke-width="3" stroke-linejoin="round">
    ${legsBare()}
    <!-- striped over-knee socks -->
    <g stroke="none" fill="#ff8fc4">${[0,1].map(s=>Array.from({length:4},(_,i)=>`<rect x="${s?192:142}" y="${430+i*16}" width="34" height="7"/>`).join("")).join("")}</g>
    <!-- high-top sneakers -->
    <path d="M138 500 L136 528 L178 528 L176 500 Z" fill="#5fd1e6"/>
    <path d="M190 500 L190 528 L228 528 L226 500 Z" fill="#ffe15a"/>
    <rect x="134" y="522" width="46" height="8" rx="3" fill="#fff"/>
    <rect x="188" y="522" width="42" height="8" rx="3" fill="#fff"/>
    <!-- frilly layered skirt -->
    <path d="M126 336 Q181 316 236 336 L252 400 Q181 384 110 400 Z" fill="#57d6e0"/>
    <path d="M118 374 q16 22 32 0 q16 22 32 0 q16 22 32 0 q16 22 32 0 l-6 22 q-63 -18 -122 0 z" fill="#ffe15a"/>
    <!-- top -->
    <path d="M134 250 Q181 236 228 250 L236 340 L126 340 Z" fill="#ff8fc4"/>
    <path d="M160 250 Q181 244 202 250 L202 336 L160 336 Z" fill="#fff" opacity="0.85"/>
    <!-- ribbon bow -->
    <path d="M181 260 l-20 -12 l0 24 z" fill="#ff5aa0"/>
    <path d="M181 260 l20 -12 l0 24 z" fill="#ff5aa0"/>
    <circle cx="181" cy="260" r="6" fill="#ffe15a"/>
    <!-- striped arm sleeves -->
    <path d="M132 256 L108 330 L130 338 L152 272 Z" fill="#5fd1e6"/>
    <path d="M228 256 L252 330 L230 338 L210 272 Z" fill="#5fd1e6"/>
    <circle cx="250" cy="336" r="14" fill="${SKIN}"/>
  </g>`;
}

// VIRTUOSO — 静玄ヴィルトゥオーゾ: dark-elegant coat, silver filigree, purple.
function bodyVirtuoso() {
  return `
  <g stroke="${INK}" stroke-width="3" stroke-linejoin="round">
    <!-- slim trousers -->
    <path d="M152 396 L146 502 L172 502 L180 402 Z" fill="#1b1730"/>
    <path d="M210 396 L200 402 L192 502 L218 502 L224 396 Z" fill="#1b1730"/>
    <!-- polished shoes -->
    <path d="M140 502 L138 524 L178 524 L176 502 Z" fill="#0c0a16"/>
    <path d="M192 502 L192 524 L226 524 L224 502 Z" fill="#0c0a16"/>
    <!-- long tailored coat -->
    <path d="M126 250 Q181 234 236 250 L250 470 L226 470 L214 356 L214 470 L148 470 L148 356 L136 470 L112 470 Z" fill="#2a1f47"/>
    <path d="M150 250 Q181 240 212 250 L206 420 L181 432 L156 420 Z" fill="#171128"/>
    <!-- waistcoat + silver filigree -->
    <path d="M164 254 L181 262 L198 254 L198 346 L164 346 Z" fill="#0f0b1c"/>
    <g stroke="#cfc8e6" stroke-width="2" fill="none">
      <path d="M181 268 q14 10 0 22 q-14 12 0 24 q14 10 0 22"/>
      <path d="M132 262 Q120 350 132 452" opacity="0.8"/>
      <path d="M230 262 Q242 350 230 452" opacity="0.8"/>
    </g>
    <line x1="181" y1="262" x2="181" y2="346" stroke="#cfc8e6" stroke-width="2"/>
    <!-- arms + cuffs -->
    <path d="M128 256 L108 356 L130 362 L150 272 Z" fill="#2a1f47"/>
    <path d="M234 256 L254 356 L232 362 L212 272 Z" fill="#2a1f47"/>
    <rect x="106" y="350" width="26" height="10" fill="#cfc8e6" opacity="0.5"/>
    <circle cx="252" cy="358" r="13" fill="${SKIN}"/>
    <!-- single silver earring -->
    <line x1="120" y1="214" x2="120" y2="230" stroke="#cfc8e6" stroke-width="3"/>
    <circle cx="120" cy="234" r="4" fill="#cfc8e6"/>
  </g>`;
}

// ---------------------------------------------------------------------------
// Aura / background decoration per look (drawn first, behind the figure).
// ---------------------------------------------------------------------------
const star = (x, y, r, fill) =>
  `<path transform="translate(${x} ${y}) scale(${r})" d="M0 -1 L0.29 -0.31 L1 -0.31 L0.42 0.12 L0.62 0.81 L0 0.38 L-0.62 0.81 L-0.42 0.12 L-1 -0.31 L-0.29 -0.31 Z" fill="${fill}"/>`;
const heart = (x, y, r, fill) =>
  `<path transform="translate(${x} ${y}) scale(${r})" d="M0 6 C-9 -2 -8 -10 -3 -10 C0 -10 0 -6 0 -6 C0 -6 0 -10 3 -10 C8 -10 9 -2 0 6 Z" fill="${fill}"/>`;

const AURA = {
  glam: `
    <defs><radialGradient id="glamA" cx="50%" cy="42%" r="60%">
      <stop offset="0%" stop-color="#ff8fd0" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#ff8fd0" stop-opacity="0"/>
    </radialGradient></defs>
    <rect width="360" height="560" fill="url(#glamA)"/>
    ${[[60,120,7],[300,150,8],[52,300,6],[312,320,7],[80,60,5],[286,70,6],[40,430,6],[320,440,7]].map(([x,y,r])=>star(x,y,r,"#ffe27a")).join("")}
    ${[[100,90,3],[268,110,3],[70,220,2.5],[300,240,3],[110,410,2.5],[262,400,3]].map(([x,y,r])=>`<circle cx="${x}" cy="${y}" r="${r}" fill="#fff"/>`).join("")}`,
  heavy: `
    <defs><radialGradient id="heavyA" cx="50%" cy="60%" r="65%">
      <stop offset="0%" stop-color="#e2472b" stop-opacity="0.4"/>
      <stop offset="70%" stop-color="#2a1a22" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#2a1a22" stop-opacity="0"/>
    </radialGradient></defs>
    <rect width="360" height="560" fill="url(#heavyA)"/>
    <g fill="#3a2f3a" opacity="0.6">
      <ellipse cx="70" cy="360" rx="46" ry="70"/><ellipse cx="300" cy="330" rx="42" ry="66"/>
      <ellipse cx="60" cy="180" rx="34" ry="50"/><ellipse cx="306" cy="200" rx="30" ry="46"/>
    </g>
    ${[[64,300,3],[300,280,3.5],[80,120,2.5],[292,140,3],[300,430,3]].map(([x,y,r])=>`<circle cx="${x}" cy="${y}" r="${r}" fill="#ff7a3c"/>`).join("")}`,
  pop: `
    <defs><radialGradient id="popA" cx="50%" cy="45%" r="62%">
      <stop offset="0%" stop-color="#bff4ff" stop-opacity="0.6"/>
      <stop offset="100%" stop-color="#bff4ff" stop-opacity="0"/>
    </radialGradient></defs>
    <rect width="360" height="560" fill="url(#popA)"/>
    ${[[62,110,7,"#ffe15a"],[300,140,8,"#ff8fc4"],[48,290,6,"#5fd1e6"],[314,300,7,"#ffe15a"],[300,440,6,"#5fd1e6"],[50,440,6,"#ff8fc4"]].map(([x,y,r,c])=>star(x,y,r,c)).join("")}
    ${[[92,70,4,"#ff7aa8"],[280,80,4,"#ff7aa8"],[70,200,3.5,"#ff9ec2"],[306,230,4,"#ff9ec2"]].map(([x,y,r,c])=>heart(x,y,r,c)).join("")}`,
  virtuoso: `
    <defs><radialGradient id="virtA" cx="50%" cy="46%" r="58%">
      <stop offset="0%" stop-color="#6b4fa0" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="#6b4fa0" stop-opacity="0"/>
    </radialGradient></defs>
    <rect width="360" height="560" fill="url(#virtA)"/>
    ${[[70,130,2.5],[300,150,3],[60,300,2],[312,320,2.5],[86,420,2],[296,430,2.5],[110,90,2],[262,100,2.2],[50,220,2],[318,240,2.4]].map(([x,y,r])=>`<circle cx="${x}" cy="${y}" r="${r}" fill="#cfc8e6"/>`).join("")}
    ${[[80,240,4],[300,270,4.5]].map(([x,y,r])=>star(x,y,r,"#b79bff"))}`,
};

// ---------------------------------------------------------------------------
// Look assembly. `mane`/`streak` tweaks let each look tint the hair subtly
// while keeping the golden-orange + pink identity readable.
// ---------------------------------------------------------------------------
const makeupGlam = `
  <g stroke="none">
    <path d="M141 190 q12 6 26 2" stroke="#ff6fb0" stroke-width="3" fill="none" opacity="0.7"/>
    <path d="M197 192 q12 4 24 -2" stroke="#ff6fb0" stroke-width="3" fill="none" opacity="0.7"/>
    <circle cx="146" cy="196" r="7" fill="#ff9ecb" opacity="0.5"/>
    <circle cx="216" cy="196" r="7" fill="#ff9ecb" opacity="0.5"/>
  </g>`;

const glamHairpin = `${star(150, 118, 11, "#ffe27a")}<circle cx="150" cy="118" r="3" fill="#fff"/>`;
const popHairclip = `${star(150, 116, 12, "#ffe15a")}${star(150,116,6,"#ff8fc4")}`;

const LOOKS = {
  glam: {
    label: "妖艶グラム",
    seg: "ビジュ層",
    parts: () =>
      AURA.glam +
      tail("#ff8fd0") +
      maneAndEars(MANE, MANE_SH, PINK) +
      bodyGlam() +
      head(makeupGlam) +
      glamHairpin +
      mic(SKIN, "#ffd257", "#7a1a4a"),
  },
  heavy: {
    label: "重鋼ヘヴィ",
    seg: "コア層",
    parts: () =>
      AURA.heavy +
      tail("#b8621c") +
      maneAndEars("#cf8b26", "#a86a14", PINK) +
      bodyHeavy() +
      head(`<path d="M138 150 l30 8" stroke="#e23b3b" stroke-width="4"/><path d="M224 158 l-28 6" stroke="#e23b3b" stroke-width="4"/>`) +
      mic(SKIN, "#8a8f9a", "#0d0b10"),
  },
  pop: {
    label: "煌ポップ",
    seg: "ライト層",
    parts: () =>
      AURA.pop +
      tail("#ff8fc4") +
      maneAndEars(MANE, MANE_SH, PINK) +
      bodyPop() +
      head("") +
      popHairclip +
      // star-topped glitter mic
      `<g stroke="${INK}" stroke-width="3" stroke-linejoin="round">
         <line x1="118" y1="300" x2="150" y2="240" stroke="#ff8fc4" stroke-width="9"/>
         <circle cx="118" cy="300" r="15" fill="${SKIN}"/></g>${star(153, 230, 18, "#ffe15a")}`,
  },
  virtuoso: {
    label: "静玄ヴィルトゥオーゾ",
    seg: "玄人層",
    parts: () =>
      AURA.virtuoso +
      tail("#7a5aa8") +
      maneAndEars("#e0a24a", "#b98a3a", "#a86bff") +
      bodyVirtuoso() +
      head("") +
      mic(SKIN, "#cfc8e6", "#141024"),
  },
};

function svgFor(key) {
  const L = LOOKS[key];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="560" viewBox="0 0 360 560">
  <!-- RISA (artKey RYO) — evolution: ${key} 【${L.label}】 / ${L.seg}でS評価 -->
${L.parts()}
</svg>
`;
}

const keys = Object.keys(LOOKS);
for (const key of keys) {
  writeFileSync(join(outDir, `ryo.v2.${key}.svg`), svgFor(key));
}

// --- in-repo viewer (open /risa-evolution.html via `npm run dev`) ------------
const cards = keys
  .map((key) => {
    const L = LOOKS[key];
    return `      <figure class="card ${key}">
        <div class="art">${svgFor(key)}</div>
        <figcaption><b>${L.label}</b><span>${L.seg} でS評価 → <code>${key}</code></span></figcaption>
      </figure>`;
  })
  .join("\n");

const html = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>RISA 見た目進化 — 試作</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; font-family: system-ui, sans-serif; background: #0e0b14; color: #f3eefb; }
  header { padding: 28px 20px 8px; text-align: center; }
  header h1 { margin: 0 0 6px; font-size: 22px; letter-spacing: 1px; }
  header p { margin: 0; color: #b6acc8; font-size: 13px; }
  .base { display: flex; flex-direction: column; align-items: center; gap: 6px; margin: 18px 0 4px; }
  .base img { height: 260px; filter: drop-shadow(0 6px 16px #0008); }
  .base span { color: #9b91b4; font-size: 12px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; padding: 20px; max-width: 980px; margin: 0 auto; }
  .card { margin: 0; background: #191324; border: 1px solid #2c2340; border-radius: 14px; overflow: hidden; }
  .art { display: flex; justify-content: center; padding: 10px; }
  .art svg { height: 300px; width: auto; }
  figcaption { padding: 10px 12px 14px; text-align: center; border-top: 1px solid #241b36; }
  figcaption b { display: block; font-size: 15px; }
  figcaption span { color: #b6acc8; font-size: 12px; }
  code { background: #2a2140; padding: 1px 6px; border-radius: 5px; font-size: 11px; }
  .glam { box-shadow: inset 0 -3px 0 #d63a8f; }
  .heavy { box-shadow: inset 0 -3px 0 #7a1420; }
  .pop { box-shadow: inset 0 -3px 0 #5fd1e6; }
  .virtuoso { box-shadow: inset 0 -3px 0 #6b4fa0; }
  footer { text-align: center; color: #7a7092; font-size: 12px; padding: 8px 20px 40px; }
</style></head>
<body>
  <header>
    <h1>RISA — 見た目進化アート（試作）</h1>
    <p>客層ターゲットでS評価（満足度80+）を取ると、その姿へ進化。identityの核（ライオン耳/尻尾・金橙マネ＋ピンクメッシュ・琥珀眼・マイク）は固定、衣装とオーラだけが変わる。</p>
  </header>
  <div class="base">
    <img src="assets/chars/ryo.v2.normal.png" alt="RISA base"/>
    <span>ベース（初期状態・v2 現行アート）</span>
  </div>
  <div class="grid">
${cards}
  </div>
  <footer>SVGはプレースホルダ試作。方向性が決まれば dna/ryo.yaml の evolutions からPNGを生成し ryo.v2.{evo}.{mood}.png へ差し替え → assets.ts の EVO_ART_READY を true に。</footer>
</body></html>
`;
writeFileSync(join(root, "public/risa-evolution.html"), html);

console.log(`Wrote ${keys.length} evolution SVGs -> ${outDir}`);
console.log("Wrote viewer -> public/risa-evolution.html");
