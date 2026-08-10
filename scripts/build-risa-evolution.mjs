// Build RISA's 4 appearance-evolution standing-art PROTOTYPES as SVG.
//
//   node scripts/build-risa-evolution.mjs
//
// These are placeholder sprites (same role as public/assets/chars/*.svg) that
// preview each evolution look BEFORE the real per-evolution PNGs are generated.
// The identity core — lion ears/tail, golden-orange mane + pink streak, amber
// eyes, mic — is shared and held constant; only outfit / accessories / palette /
// aura change per look, each pinned to a real metal subgenre. Mirrors
// dna/ryo.yaml `evolutions` and the game's EVO_INFIX:
//   goth=ビジュ(Evanescence系) / hard=コア(正統派HR) /
//   kawaii=ライト(BABYMETAL系) / death=玄人(ウォー/デス)
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

// GOTH — 幽艶ゴシック (Evanescence系): black lace gown, crimson underskirt, tiara.
function bodyGoth() {
  return `
  <g stroke="${INK}" stroke-width="3" stroke-linejoin="round">
    <!-- dark stockings + heeled boots -->
    <path d="M150 396 L144 500 L172 500 L178 402 Z" fill="#1a1526"/>
    <path d="M212 396 L200 402 L192 500 L220 500 L226 396 Z" fill="#1a1526"/>
    <path d="M140 500 L138 530 L176 530 L176 500 Z" fill="#0e0a16"/>
    <path d="M190 500 L190 530 L228 530 L226 500 Z" fill="#0e0a16"/>
    <rect x="150" y="530" width="4" height="14" fill="${INK}"/>
    <rect x="210" y="530" width="4" height="14" fill="${INK}"/>
    <!-- crimson underskirt then black overskirt with a center slit -->
    <path d="M120 330 Q181 312 242 330 L268 478 Q181 458 94 478 Z" fill="#7a1030"/>
    <path d="M120 330 Q150 320 174 322 L174 470 L94 478 Z" fill="#15111d"/>
    <path d="M188 322 Q212 320 242 330 L268 478 L188 470 Z" fill="#15111d"/>
    <path d="M120 330 Q181 314 242 330" stroke="#4a1730" stroke-width="3" fill="none"/>
    <!-- corset bodice -->
    <path d="M138 250 Q181 236 224 250 L234 340 L128 340 Z" fill="#0f0b16"/>
    <path d="M152 256 Q181 248 210 256 L204 336 L158 336 Z" fill="#5a0c24"/>
    <g stroke="#cfc8e6" stroke-width="1.6" opacity="0.85">
      ${Array.from({length:4},(_,i)=>`<path d="M164 ${266+i*18} L198 ${276+i*18} M198 ${266+i*18} L164 ${276+i*18}" fill="none"/>`).join("")}
    </g>
    <!-- long lace sleeves -->
    <path d="M136 256 L112 346 L136 352 L156 272 Z" fill="#15111d"/>
    <path d="M226 256 L250 346 L226 352 L206 272 Z" fill="#15111d"/>
    <rect x="110" y="340" width="28" height="12" fill="#cfc8e6" opacity="0.45"/>
    <rect x="224" y="340" width="28" height="12" fill="#cfc8e6" opacity="0.45"/>
    <circle cx="124" cy="352" r="13" fill="${SKIN}"/>
    <circle cx="238" cy="352" r="13" fill="${SKIN}"/>
    <!-- black rose choker -->
    <path d="M158 236 Q181 247 204 236" stroke="#0e0a16" stroke-width="6" fill="none"/>
    <circle cx="181" cy="244" r="7" fill="#7a1030" stroke="#2a0a14" stroke-width="1.5"/>
  </g>`;
}

// HARD — 鋼鉄ハードロック (正統派): open leather jacket, band tee, bullet belt, denim.
function bodyHard() {
  return `
  <g stroke="${INK}" stroke-width="3" stroke-linejoin="round">
    ${legsBare()}
    <!-- chunky boots -->
    <path d="M138 500 L136 530 L178 530 L176 500 Z" fill="#241a12"/>
    <path d="M190 500 L190 530 L228 530 L226 500 Z" fill="#241a12"/>
    <rect x="136" y="500" width="42" height="7" fill="#3a2a1c"/>
    <rect x="190" y="500" width="38" height="7" fill="#3a2a1c"/>
    <!-- denim shorts -->
    <path d="M142 386 Q181 376 220 386 L224 424 Q181 436 138 424 Z" fill="#2f4a70"/>
    <line x1="181" y1="392" x2="181" y2="428" stroke="#1e3350" stroke-width="2"/>
    <!-- band tee -->
    <path d="M136 250 Q181 238 226 250 L232 392 L130 392 Z" fill="#1a1620"/>
    <path d="M164 288 h34 v6 h-34 z M170 300 l22 0 -6 14 -10 0 z" fill="#c62438"/>
    <!-- bullet belt -->
    <rect x="128" y="384" width="106" height="12" fill="#2b2620"/>
    <g fill="#d9b23a">${Array.from({length:7},(_,i)=>`<rect x="${134+i*14}" y="386" width="6" height="8" rx="2"/>`).join("")}</g>
    <!-- open leather jacket (front panels) -->
    <path d="M120 250 L106 396 L148 396 L152 262 Z" fill="#14121a"/>
    <path d="M242 250 L256 396 L214 396 L210 262 Z" fill="#14121a"/>
    <!-- small silver studs on collar/shoulders (classic, not brutal) -->
    <g fill="#c7ccd6">${[[124,262],[130,278],[238,262],[232,278]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="3"/>`).join("")}</g>
    <!-- jacket sleeves + studded wristbands -->
    <path d="M124 256 L100 350 L124 360 L148 272 Z" fill="#14121a"/>
    <path d="M238 256 L262 350 L238 360 L214 272 Z" fill="#14121a"/>
    <rect x="98" y="346" width="26" height="12" fill="#3a3630"/>
    <rect x="238" y="346" width="26" height="12" fill="#3a3630"/>
    <g fill="#c7ccd6">${[[104,352],[112,352],[118,352],[244,352],[252,352],[258,352]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="2"/>`).join("")}</g>
    <circle cx="110" cy="366" r="13" fill="${SKIN}"/>
    <circle cx="252" cy="366" r="13" fill="${SKIN}"/>
  </g>`;
}

// KAWAII — 紅黒カワメタ (BABYMETAL系): black-and-red frilly idol dress, red tutu.
function bodyKawaii() {
  return `
  <g stroke="${INK}" stroke-width="3" stroke-linejoin="round">
    ${legsBare()}
    <!-- black-and-red striped thigh socks -->
    <g stroke="none">${[0,1].map(s=>Array.from({length:5},(_,i)=>`<rect x="${s?192:142}" y="${426+i*14}" width="34" height="7" fill="${i%2?'#d81f3a':'#181018'}"/>`).join("")).join("")}</g>
    <!-- red mary-jane boots -->
    <path d="M138 500 L136 528 L178 528 L176 500 Z" fill="#d81f3a"/>
    <path d="M190 500 L190 528 L228 528 L226 500 Z" fill="#d81f3a"/>
    <rect x="134" y="522" width="46" height="7" rx="3" fill="#101010"/>
    <rect x="188" y="522" width="42" height="7" rx="3" fill="#101010"/>
    <!-- black lace underskirt + red tutu with scalloped hem -->
    <path d="M124 336 Q181 318 238 336 L254 404 Q181 388 108 404 Z" fill="#161018"/>
    <path d="M120 336 Q181 320 242 336 L248 372 q-16 18 -30 2 q-14 18 -30 2 q-14 18 -30 2 q-14 18 -30 2 q-14 16 -30 0 z" fill="#d81f3a"/>
    <path d="M118 366 q15 16 30 2 q15 16 30 2 q15 16 30 2 q15 16 30 2" stroke="#fff" stroke-width="3" fill="none" opacity="0.85"/>
    <!-- corset bodice: black with red center panel + white cross lacing -->
    <path d="M134 250 Q181 236 228 250 L236 340 L126 340 Z" fill="#171018"/>
    <path d="M158 250 Q181 244 204 250 L204 336 L158 336 Z" fill="#d81f3a"/>
    <g stroke="#fff" stroke-width="1.8" opacity="0.9">
      ${Array.from({length:4},(_,i)=>`<path d="M166 ${266+i*16} L196 ${274+i*16} M196 ${266+i*16} L166 ${274+i*16}" fill="none"/>`).join("")}
    </g>
    <!-- red ribbon bow -->
    <path d="M181 258 l-18 -11 l0 22 z" fill="#ff3d68"/>
    <path d="M181 258 l18 -11 l0 22 z" fill="#ff3d68"/>
    <circle cx="181" cy="258" r="6" fill="#fff"/>
    <!-- black-red striped arm warmers -->
    <path d="M132 256 L108 336 L130 344 L152 272 Z" fill="#171018"/>
    <path d="M228 256 L252 336 L230 344 L210 272 Z" fill="#171018"/>
    <g stroke="#d81f3a" stroke-width="4">
      <path d="M118 300 l16 4 M114 318 l16 4" fill="none"/>
      <path d="M244 300 l-16 4 M248 318 l-16 4" fill="none"/>
    </g>
    <circle cx="120" cy="342" r="13" fill="${SKIN}"/>
    <circle cx="240" cy="342" r="13" fill="${SKIN}"/>
  </g>`;
}

// DEATH — 戦鬼デスメタル (ウォー/デス): black armor, heavy spikes, bullet belt.
function bodyDeath() {
  return `
  <g stroke="${INK}" stroke-width="3" stroke-linejoin="round">
    <path d="M150 396 L142 500 L172 500 L178 402 Z" fill="#0f0d13"/>
    <path d="M212 396 L200 402 L192 500 L222 500 L226 396 Z" fill="#0f0d13"/>
    <!-- spiked steel boots -->
    <path d="M136 500 L134 530 L178 530 L176 500 Z" fill="#08070a"/>
    <path d="M190 500 L190 530 L230 530 L226 500 Z" fill="#08070a"/>
    <g fill="#c7ccd6">${[[140,500],[152,500],[164,500],[194,500],[206,500],[218,500]].map(([x,y])=>`<path d="M${x} ${y} l5 -9 l5 9 z"/>`).join("")}</g>
    <!-- tattered war garb -->
    <path d="M130 250 Q181 236 232 250 L244 392 L236 402 L224 388 L210 402 L196 388 L181 402 L166 388 L152 402 L138 388 L130 400 L118 392 Z" fill="#141017"/>
    <path d="M156 250 Q181 244 206 250 L206 360 L181 376 L156 360 Z" fill="#3a0a10"/>
    <!-- bullet belt + chains -->
    <rect x="118" y="376" width="126" height="12" fill="#241f1a"/>
    <g fill="#d9b23a">${Array.from({length:9},(_,i)=>`<rect x="${124+i*13}" y="378" width="6" height="8" rx="2"/>`).join("")}</g>
    <path d="M130 306 Q181 336 232 306" stroke="#8a9099" stroke-width="4" fill="none" stroke-dasharray="3 3"/>
    <!-- black armor with HEAVY spiked shoulder pauldrons -->
    <path d="M116 250 L88 372 L126 372 L140 266 Z" fill="#0e0c12"/>
    <path d="M246 250 L274 372 L236 372 L222 266 Z" fill="#0e0c12"/>
    <g fill="#c7ccd6">
      <path d="M104 246 l12 -18 l12 18 z"/><path d="M86 268 l12 -18 l12 18 z"/><path d="M92 300 l12 -16 l12 16 z"/>
      <path d="M234 246 l12 -18 l12 18 z"/><path d="M258 268 l12 -18 l12 18 z"/><path d="M246 300 l12 -16 l12 16 z"/>
    </g>
    <!-- spiked gauntlets -->
    <circle cx="104" cy="366" r="15" fill="#0e0c12"/>
    <circle cx="258" cy="366" r="15" fill="#0e0c12"/>
    <g fill="#c7ccd6">${[[92,360],[100,352],[110,354],[252,354],[262,352],[270,360]].map(([x,y])=>`<path d="M${x} ${y} l-4 -8 l8 2 z"/>`).join("")}</g>
    <!-- spiked collar -->
    <path d="M154 236 Q181 249 208 236 L208 245 Q181 258 154 245 Z" fill="#08070a"/>
    <g fill="#c7ccd6">${Array.from({length:6},(_,i)=>`<path d="M${160+i*9} 240 l3 -9 l3 9 z"/>`).join("")}</g>
  </g>`;
}

// ---------------------------------------------------------------------------
// Aura / background decoration per look (drawn first, behind the figure).
// ---------------------------------------------------------------------------
const star = (x, y, r, fill) =>
  `<path transform="translate(${x} ${y}) scale(${r})" d="M0 -1 L0.29 -0.31 L1 -0.31 L0.42 0.12 L0.62 0.81 L0 0.38 L-0.62 0.81 L-0.42 0.12 L-1 -0.31 L-0.29 -0.31 Z" fill="${fill}"/>`;
const heart = (x, y, r, fill) =>
  `<path transform="translate(${x} ${y}) scale(${r})" d="M0 6 C-9 -2 -8 -10 -3 -10 C0 -10 0 -6 0 -6 C0 -6 0 -10 3 -10 C8 -10 9 -2 0 6 Z" fill="${fill}"/>`;

const petal = (x, y, rot, fill) =>
  `<path transform="translate(${x} ${y}) rotate(${rot})" d="M0 0 Q6 -7 0 -16 Q-6 -7 0 0 Z" fill="${fill}"/>`;

const AURA = {
  goth: `
    <defs><radialGradient id="gothA" cx="50%" cy="44%" r="62%">
      <stop offset="0%" stop-color="#4a2a63" stop-opacity="0.55"/>
      <stop offset="70%" stop-color="#1a1020" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="#1a1020" stop-opacity="0"/>
    </radialGradient></defs>
    <rect width="360" height="560" fill="url(#gothA)"/>
    <g opacity="0.85">${[[66,120,18,"#7a1030"],[300,150,-24,"#7a1030"],[54,300,40,"#5a0c24"],[312,320,-40,"#5a0c24"],[80,440,10,"#7a1030"],[292,440,-14,"#5a0c24"],[120,70,60,"#6a0e2a"]].map(([x,y,r,c])=>petal(x,y,r,c)).join("")}</g>
    ${[[100,90,2.5],[268,110,2.5],[70,220,2],[300,240,2.5],[110,410,2],[262,400,2.5]].map(([x,y,r])=>`<circle cx="${x}" cy="${y}" r="${r}" fill="#e6d8ff" opacity="0.8"/>`).join("")}`,
  hard: `
    <defs><radialGradient id="hardA" cx="50%" cy="52%" r="62%">
      <stop offset="0%" stop-color="#ffb03a" stop-opacity="0.5"/>
      <stop offset="70%" stop-color="#b5400f" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#b5400f" stop-opacity="0"/>
    </radialGradient></defs>
    <rect width="360" height="560" fill="url(#hardA)"/>
    <g fill="#ff7a1c" opacity="0.9">
      <path d="M60 470 q-8 -30 8 -50 q4 22 16 28 q-6 14 -24 22 z"/>
      <path d="M304 460 q10 -34 -6 -56 q-4 24 -16 30 q6 14 22 26 z"/>
    </g>
    ${[[64,300,3],[300,280,3.5],[80,120,2.5],[292,140,3],[70,430,3],[300,430,3],[120,70,2.5],[262,70,2.5]].map(([x,y,r])=>`<circle cx="${x}" cy="${y}" r="${r}" fill="#ffd257"/>`).join("")}`,
  kawaii: `
    <defs><radialGradient id="kawA" cx="50%" cy="46%" r="62%">
      <stop offset="0%" stop-color="#ff466e" stop-opacity="0.42"/>
      <stop offset="100%" stop-color="#ff466e" stop-opacity="0"/>
    </radialGradient></defs>
    <rect width="360" height="560" fill="url(#kawA)"/>
    ${[[62,110,7,"#ffffff"],[300,140,8,"#d81f3a"],[48,290,6,"#ffffff"],[314,300,7,"#d81f3a"],[300,440,6,"#ffffff"],[50,440,6,"#d81f3a"]].map(([x,y,r,c])=>star(x,y,r,c)).join("")}
    ${[[92,70,4,"#181018"],[280,80,4,"#d81f3a"],[70,200,3.5,"#181018"],[306,230,4,"#d81f3a"]].map(([x,y,r,c])=>heart(x,y,r,c)).join("")}
    <g>${[[110,150,"#ffd257"],[250,120,"#5fd1e6"],[130,430,"#d81f3a"],[240,420,"#181018"]].map(([x,y,c])=>`<rect x="${x}" y="${y}" width="7" height="12" rx="2" transform="rotate(24 ${x} ${y})" fill="${c}"/>`).join("")}</g>`,
  death: `
    <defs><radialGradient id="deathA" cx="50%" cy="56%" r="66%">
      <stop offset="0%" stop-color="#c01522" stop-opacity="0.45"/>
      <stop offset="60%" stop-color="#1a0d10" stop-opacity="0.6"/>
      <stop offset="100%" stop-color="#0a0509" stop-opacity="0"/>
    </radialGradient></defs>
    <rect width="360" height="560" fill="url(#deathA)"/>
    <g fill="#241820" opacity="0.7">
      <ellipse cx="66" cy="360" rx="48" ry="74"/><ellipse cx="300" cy="330" rx="44" ry="70"/>
      <ellipse cx="58" cy="170" rx="34" ry="52"/><ellipse cx="308" cy="190" rx="30" ry="48"/>
    </g>
    <g fill="#12090c" opacity="0.9">${[[30,540,-16],[64,540,-10],[300,540,12],[332,540,18],[16,540,-22]].map(([x,y,r])=>`<path d="M${x} ${y} l14 -46 l14 46 z" transform="rotate(${r} ${x+14} ${y})"/>`).join("")}</g>
    ${[[64,300,3],[300,280,3.5],[80,120,2.5],[292,140,3],[300,430,3.5],[72,440,3]].map(([x,y,r])=>`<circle cx="${x}" cy="${y}" r="${r}" fill="#ff3b26"/>`).join("")}`,
};

// ---------------------------------------------------------------------------
// Look assembly. Identity core (mane+streak, ears, amber eyes, tail, mic) is
// shared; each look tints the hair subtly and swaps outfit + face makeup.
// ---------------------------------------------------------------------------
const gothMakeup = `
  <g stroke="none">
    <path d="M136 168 q18 -8 34 -2 l-2 12 q-16 -6 -32 0 z" fill="#2a1830" opacity="0.75"/>
    <path d="M192 166 q16 -6 34 2 l-2 10 q-16 -6 -30 0 z" fill="#2a1830" opacity="0.75"/>
    <path d="M148 210 q10 6 22 4" stroke="#7a1030" stroke-width="3" fill="none" opacity="0.6"/>
  </g>`;

// Corpse paint: white face wash + black eye sockets + a vertical black stripe.
const corpsePaint = `
  <g stroke="none">
    <circle cx="181" cy="168" r="69" fill="#eceaee"/>
    <ellipse cx="153" cy="176" rx="21" ry="27" fill="#0c0910"/>
    <ellipse cx="209" cy="176" rx="21" ry="27" fill="#0c0910"/>
    <path d="M175 108 L170 236 L192 236 L187 108 Z" fill="#0c0910" opacity="0.5"/>
  </g>`;

const gothTiara = `
  <g stroke="${INK}" stroke-width="1.5">
    <path d="M150 108 l8 -14 l8 12 l8 -14 l8 12 l8 -12 l8 14 z" fill="#cfc8e6"/>
    <circle cx="182" cy="100" r="3" fill="#7a1030"/>
  </g>`;
const kawaiiClip = `${star(150, 114, 12, "#d81f3a")}${star(150,114,6,"#fff")}`;

const LOOKS = {
  goth: {
    label: "幽艶ゴシック",
    seg: "ビジュ層",
    genre: "ゴシック/シンフォニック (Evanescence系)",
    parts: () =>
      AURA.goth +
      tail("#7a1030") +
      maneAndEars("#d8912e", "#a86a14", PINK) +
      bodyGoth() +
      head(gothMakeup) +
      gothTiara +
      mic(SKIN, "#4a2a63", "#120a18"),
  },
  hard: {
    label: "鋼鉄ハードロック",
    seg: "コア層",
    genre: "正統派ハードロック / メタル",
    parts: () =>
      AURA.hard +
      tail(MANE) +
      maneAndEars(MANE, MANE_SH, PINK) +
      bodyHard() +
      head("") +
      mic(SKIN, "#8a8f9a", "#0d0b10"),
  },
  kawaii: {
    label: "紅黒カワメタ",
    seg: "ライト層",
    genre: "カワイイメタル (BABYMETAL系)",
    parts: () =>
      AURA.kawaii +
      tail("#d81f3a") +
      maneAndEars(MANE, MANE_SH, PINK) +
      bodyKawaii() +
      head("") +
      kawaiiClip +
      mic(SKIN, "#d81f3a", "#181018"),
  },
  death: {
    label: "戦鬼デスメタル",
    seg: "玄人層",
    genre: "ウォー / デスメタル",
    parts: () =>
      AURA.death +
      tail("#7a4a12") +
      maneAndEars("#b9781e", "#7f5210", PINK) +
      bodyDeath() +
      head(corpsePaint) +
      mic(SKIN, "#8a9099", "#0a0508"),
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
        <figcaption><b>${L.label}</b><span class="genre">${L.genre}</span><span>${L.seg} でS評価 → <code>${key}</code></span></figcaption>
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
  figcaption span { display: block; color: #b6acc8; font-size: 12px; }
  figcaption .genre { color: #e6b3ff; font-size: 11px; margin: 2px 0 4px; }
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
