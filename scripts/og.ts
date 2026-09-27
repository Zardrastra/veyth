import { Resvg } from "@resvg/resvg-js";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

/**
 * Open Graph images (1200×630 PNG) for link previews: Vey the mascot next to the page's
 * title and description. Rendered at build time with resvg and a bundled Inter, so the
 * output is the same on any machine. Called from the prerender plugin in vite.config.ts.
 */

// Keep in sync with og:image:width/height in index.html.
const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

// import.meta.url (not dirname): Vite rewrites it to this file's location when it bundles the config.
const FONT_FILES = ["Inter-Regular.ttf", "Inter-Bold.ttf"].map((f) => fileURLToPath(new URL(`og-fonts/${f}`, import.meta.url)));

const C = { bg: "#0a0a0a", surface: "#141414", surface2: "#1c1c1c", border: "#2a2a2a", text: "#ededed", muted: "#9a9a9a", accent: "#c8ff00", pink: "#ff4d6a" };

export type OgCard = {
  /** Path shown next to the brand, e.g. "/json" */
  path: string;
  /** Title lines; a line wrapped in `*…*` is drawn in the accent colour */
  title: string;
  description: string;
  /** Short text in Vey's speech bubble, e.g. "{ }" */
  glyph?: string;
  /** Small labels along the bottom (the homepage lists the tools) */
  chips?: string[];
  /** One line along the bottom, used when there are no chips */
  tagline?: string;
  mood?: "happy" | "love";
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function render(svg: string) {
  return new Resvg(svg, { font: { fontFiles: FONT_FILES, loadSystemFonts: false, defaultFontFamily: "Inter" } });
}

const widths = new Map<string, number>();
/** Rendered width of a single line of text, measured with the same fonts resvg draws with. */
function measure(text: string, size: number, weight: number) {
  const key = `${size}/${weight}/${text}`;
  let w = widths.get(key);
  if (w === undefined) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="${size * 2}"><text x="0" y="${size * 1.5}" font-family="Inter" font-size="${size}" font-weight="${weight}">${esc(text)}</text></svg>`;
    w = render(svg).getBBox()?.width ?? 0;
    widths.set(key, w);
  }
  return w;
}

/** Greedy word wrap; the last allowed line gets an ellipsis if text is left over. */
function wrap(text: string, size: number, weight: number, maxWidth: number, maxLines: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (let i = 0; i < words.length; i++) {
    const next = line ? `${line} ${words[i]}` : words[i];
    if (!line || measure(next, size, weight) <= maxWidth) {
      line = next;
      continue;
    }
    if (lines.length === maxLines - 1) {
      while (line.includes(" ") && measure(`${line}…`, size, weight) > maxWidth) line = line.slice(0, line.lastIndexOf(" "));
      return [...lines, `${line.replace(/[\s,.;:—–-]+$/, "")}…`];
    }
    lines.push(line);
    line = words[i];
  }
  return line ? [...lines, line] : lines;
}

/** Vey, drawn from the same shapes as src/components/Mascot.tsx (32×32 viewBox). */
function mascot(x: number, y: number, size: number, mood: "happy" | "love") {
  const eye = mood === "love" ? C.pink : C.accent;
  const mouth =
    mood === "love"
      ? `<path d="M14.5 17.5 Q16 19.2 17.5 17.5" stroke="${C.pink}" stroke-width="1" stroke-linecap="round" fill="none"/>
         <circle cx="12.2" cy="16.5" r="0.9" fill="${C.pink}" opacity="0.35"/><circle cx="19.8" cy="16.5" r="0.9" fill="${C.pink}" opacity="0.35"/>`
      : `<path d="M13.8 17.2 Q16 19 18.2 17.2" stroke="#5a5a5a" stroke-width="1" stroke-linecap="round" fill="none"/>`;
  return `<g transform="translate(${x} ${y}) scale(${size / 32})">
    <line x1="16" y1="6" x2="16" y2="3.5" stroke="${C.border}" stroke-width="1.5" stroke-linecap="round"/>
    <circle cx="16" cy="2.2" r="1.8" fill="${C.accent}"/>
    <circle cx="16" cy="2.2" r="0.7" fill="${C.bg}" opacity="0.35"/>
    <rect x="7" y="7" width="18" height="16" rx="4.5" fill="${C.surface2}" stroke="${C.border}" stroke-width="1.3"/>
    <rect x="10.5" y="10.5" width="11" height="9" rx="2.2" fill="${C.bg}" stroke="${C.border}" stroke-width="1"/>
    <circle cx="14.2" cy="13.5" r="1.7" fill="${eye}" filter="url(#eyeGlow)"/>
    <circle cx="17.8" cy="13.5" r="1.7" fill="${eye}" filter="url(#eyeGlow)"/>
    ${mouth}
    <circle cx="8.5" cy="15" r="0.9" fill="${C.border}"/>
    <circle cx="23.5" cy="15" r="0.9" fill="${C.border}"/>
    <rect x="11" y="24.2" width="4" height="1.6" rx="0.8" fill="${C.border}"/>
    <rect x="17" y="24.2" width="4" height="1.6" rx="0.8" fill="${C.border}"/>
  </g>`;
}

/** The favicon tile, for the brand mark in the top-left corner. */
function logo(x: number, y: number, size: number) {
  return `<g transform="translate(${x} ${y}) scale(${size / 32})">
    <rect width="32" height="32" rx="7" fill="${C.accent}"/>
    <line x1="16" y1="7.5" x2="16" y2="4.5" stroke="${C.bg}" stroke-width="2" stroke-linecap="round"/>
    <circle cx="16" cy="4" r="2.2" fill="${C.bg}"/>
    <rect x="5.5" y="8" width="21" height="17.5" rx="5" fill="${C.bg}"/>
    <circle cx="12.3" cy="15.5" r="2.6" fill="${C.accent}"/>
    <circle cx="19.7" cy="15.5" r="2.6" fill="${C.accent}"/>
    <rect x="9" y="26.5" width="5" height="2.5" rx="1.25" fill="${C.bg}"/>
    <rect x="18" y="26.5" width="5" height="2.5" rx="1.25" fill="${C.bg}"/>
  </g>`;
}

function bubble(glyph: string, right: number, bottom: number) {
  const size = 44;
  const w = Math.max(measure(glyph, size, 700) + 56, 112);
  const h = 84;
  const x = right - w;
  const y = bottom - h;
  return `<g>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="22" fill="${C.surface}" stroke="${C.border}" stroke-width="2"/>
    <path d="M${right - 44} ${bottom - 1} L${right - 10} ${bottom + 30} L${right - 18} ${bottom - 1} Z" fill="${C.surface}"/>
    <path d="M${right - 44} ${bottom} L${right - 10} ${bottom + 30} L${right - 18} ${bottom}" fill="none" stroke="${C.border}" stroke-width="2" stroke-linejoin="round"/>
    <text x="${x + w / 2}" y="${y + h / 2 + size * 0.36}" text-anchor="middle" font-size="${size}" font-weight="700" fill="${C.accent}">${esc(glyph)}</text>
  </g>`;
}

export function ogSvg(card: OgCard) {
  const left = 80;
  const textWidth = 620;

  // Title: explicit lines (homepage) or wrapped; shrink a long title before it gets a third line.
  const explicit = card.title.includes("\n");
  let titleSize = 68;
  let titleLines = explicit ? card.title.split("\n") : wrap(card.title, titleSize, 700, textWidth, 3);
  if (!explicit && titleLines.length > 2) {
    titleSize = 56;
    titleLines = wrap(card.title, titleSize, 700, textWidth, 3);
  }
  const titleLead = titleSize * 1.12;
  const titleTop = 196 + titleSize * 0.8;
  const title = titleLines
    .map((l, i) => {
      const accent = /^\*.*\*$/.test(l);
      return `<text x="${left}" y="${titleTop + i * titleLead}" font-size="${titleSize}" font-weight="700" letter-spacing="-1.5" fill="${accent ? C.accent : C.text}">${esc(accent ? l.slice(1, -1) : l)}</text>`;
    })
    .join("");

  const descSize = 28;
  const descLead = descSize * 1.45;
  const descTop = titleTop + (titleLines.length - 1) * titleLead + 34 + descSize;
  const descLines = wrap(card.description, descSize, 400, textWidth, card.chips ? 2 : 3);
  const desc = descLines.map((l, i) => `<text x="${left}" y="${descTop + i * descLead}" font-size="${descSize}" fill="${C.muted}">${esc(l)}</text>`).join("");

  // Footer: tool chips (homepage) or a tagline.
  let footer = "";
  if (card.chips) {
    let x = left;
    for (const chip of card.chips) {
      const w = measure(chip, 20, 700) + 28;
      if (x + w > 800) break;
      footer += `<rect x="${x}" y="524" width="${w}" height="40" rx="20" fill="${C.surface}" stroke="${C.border}" stroke-width="2"/>
        <text x="${x + w / 2}" y="551" text-anchor="middle" font-size="20" font-weight="700" fill="${C.text}">${esc(chip)}</text>`;
      x += w + 10;
    }
  } else if (card.tagline) {
    footer = `<circle cx="${left + 7}" cy="544" r="7" fill="${C.accent}"/>
      <text x="${left + 26}" y="552" font-size="24" fill="${C.muted}">${esc(card.tagline)}</text>`;
  }

  const mascotSize = 400;
  const mx = 760;
  const my = 150;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_WIDTH}" height="${OG_HEIGHT}" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}" font-family="Inter">
  <defs>
    <pattern id="dots" width="32" height="32" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.4" fill="#1d1d1d"/></pattern>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${C.accent}" stop-opacity="0.18"/>
      <stop offset="1" stop-color="${C.accent}" stop-opacity="0"/>
    </radialGradient>
    <filter id="eyeGlow" x="-100%" y="-100%" width="300%" height="300%">
      <feGaussianBlur stdDeviation="0.6" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="100%" height="100%" fill="${C.bg}"/>
  <rect width="100%" height="100%" fill="url(#dots)"/>
  <circle cx="${mx + mascotSize / 2}" cy="${my + mascotSize * 0.45}" r="330" fill="url(#glow)"/>
  <ellipse cx="${mx + mascotSize / 2}" cy="${my + mascotSize * 0.83}" rx="${mascotSize * 0.26}" ry="12" fill="#000" opacity="0.6"/>
  ${mascot(mx, my, mascotSize, card.mood ?? "happy")}
  ${card.glyph ? bubble(card.glyph, mx + 130, my + 70) : ""}
  ${logo(left, 72, 52)}
  <text x="${left + 70}" y="108" font-size="32" font-weight="700" fill="${C.text}">veyth.eu<tspan fill="${C.accent}">${esc(card.path === "/" ? "" : card.path)}</tspan></text>
  ${title}
  ${desc}
  ${footer}
  <rect x="0" y="${OG_HEIGHT - 8}" width="${OG_WIDTH}" height="8" fill="${C.accent}"/>
</svg>`;
}

/** Render a card to PNG; the file name carries a content hash so it can be cached as immutable. */
export function ogPng(card: OgCard) {
  const png = render(ogSvg(card)).render().asPng();
  const hash = createHash("sha256").update(png).digest("hex").slice(0, 8);
  return { png, hash };
}
