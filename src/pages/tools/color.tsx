import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { CopyButton, Panel, Segmented, ShareButton, ToolHeader, VeyStatus, btn, btnSm, fieldCls } from "../../components/ui";
import { useHashState } from "../../lib/share";
import { useStored } from "../../lib/storage";

// The photo is drawn to a <canvas> in this tab and sampled there — it's never uploaded.
// Neighbouring colours are spaced in OKLab, where equal distances look like equal differences,
// so each honeycomb ring is roughly one "spread" step further from the centre to the eye.

type RGB = [number, number, number];
type Lab = [number, number, number];
type Mode = "ab" | "lh" | "lc";
type Point = { x: number; y: number };
type Photo = { name: string; data: ImageData };
type Source = { kind: "photo"; x: number; y: number } | { kind: "manual"; rgb: RGB };
/** A colour picked in the honeycomb, and where the grid is centred. Null = both follow the sample. */
type Override = { center: RGB; sel: RGB; key: string };

/* ---------- colour math: sRGB ⇄ OKLab ---------- */

const toLin = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c: number) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function linToLab(r: number, g: number, b: number): Lab {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
const rgbToLab = ([r, g, b]: RGB) => linToLab(toLin(r), toLin(g), toLin(b));

/** Null when the colour is outside what an sRGB screen can show. */
function labToRgb([L, a, b]: Lab): RGB | null {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  if (lin.some((c) => c < -0.0015 || c > 1.0015)) return null;
  return lin.map((c) => Math.round(clamp(toSrgb(clamp(c, 0, 1)), 0, 255))) as RGB;
}

/** ΔE in OKLab, scaled ×100 so ~2 is "barely noticeable". */
const deltaE = (a: Lab, b: Lab) => 100 * Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const same = (a: RGB, b: RGB) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
const hex = (rgb: RGB) => "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("");
const round = (n: number, d = 1) => String(Math.round(n * 10 ** d) / 10 ** d);
const isLight = (rgb: RGB) => rgbToLab(rgb)[0] > 0.62;

function hsx([R, G, B]: RGB) {
  const r = R / 255, g = G / 255, b = B / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  const l = (max + min) / 2;
  return { h: (h * 60 + 360) % 360, sl: d ? d / (1 - Math.abs(2 * l - 1)) : 0, l, sv: max ? d / max : 0, v: max };
}

function cmyk([R, G, B]: RGB) {
  const k = 1 - Math.max(R, G, B) / 255;
  if (k >= 1) return [0, 0, 0, 100];
  return [R, G, B].map((c) => Math.round(((1 - c / 255 - k) / (1 - k)) * 100)).concat(Math.round(k * 100));
}

// CSS named colours (aliases like cyan/magenta/grey left out — they duplicate these).
const NAMES = "aliceblue f0f8ff antiquewhite faebd7 aqua 00ffff aquamarine 7fffd4 azure f0ffff beige f5f5dc bisque ffe4c4 black 000000 blanchedalmond ffebcd blue 0000ff blueviolet 8a2be2 brown a52a2a burlywood deb887 cadetblue 5f9ea0 chartreuse 7fff00 chocolate d2691e coral ff7f50 cornflowerblue 6495ed cornsilk fff8dc crimson dc143c darkblue 00008b darkcyan 008b8b darkgoldenrod b8860b darkgray a9a9a9 darkgreen 006400 darkkhaki bdb76b darkmagenta 8b008b darkolivegreen 556b2f darkorange ff8c00 darkorchid 9932cc darkred 8b0000 darksalmon e9967a darkseagreen 8fbc8f darkslateblue 483d8b darkslategray 2f4f4f darkturquoise 00ced1 darkviolet 9400d3 deeppink ff1493 deepskyblue 00bfff dimgray 696969 dodgerblue 1e90ff firebrick b22222 floralwhite fffaf0 forestgreen 228b22 fuchsia ff00ff gainsboro dcdcdc ghostwhite f8f8ff gold ffd700 goldenrod daa520 gray 808080 green 008000 greenyellow adff2f honeydew f0fff0 hotpink ff69b4 indianred cd5c5c indigo 4b0082 ivory fffff0 khaki f0e68c lavender e6e6fa lavenderblush fff0f5 lawngreen 7cfc00 lemonchiffon fffacd lightblue add8e6 lightcoral f08080 lightcyan e0ffff lightgoldenrodyellow fafad2 lightgray d3d3d3 lightgreen 90ee90 lightpink ffb6c1 lightsalmon ffa07a lightseagreen 20b2aa lightskyblue 87cefa lightslategray 778899 lightsteelblue b0c4de lightyellow ffffe0 lime 00ff00 limegreen 32cd32 linen faf0e6 maroon 800000 mediumaquamarine 66cdaa mediumblue 0000cd mediumorchid ba55d3 mediumpurple 9370db mediumseagreen 3cb371 mediumslateblue 7b68ee mediumspringgreen 00fa9a mediumturquoise 48d1cc mediumvioletred c71585 midnightblue 191970 mintcream f5fffa mistyrose ffe4e1 moccasin ffe4b5 navajowhite ffdead navy 000080 oldlace fdf5e6 olive 808000 olivedrab 6b8e23 orange ffa500 orangered ff4500 orchid da70d6 palegoldenrod eee8aa palegreen 98fb98 paleturquoise afeeee palevioletred db7093 papayawhip ffefd5 peachpuff ffdab9 peru cd853f pink ffc0cb plum dda0dd powderblue b0e0e6 purple 800080 rebeccapurple 663399 red ff0000 rosybrown bc8f8f royalblue 4169e1 saddlebrown 8b4513 salmon fa8072 sandybrown f4a460 seagreen 2e8b57 seashell fff5ee sienna a0522d silver c0c0c0 skyblue 87ceeb slateblue 6a5acd slategray 708090 snow fffafa springgreen 00ff7f steelblue 4682b4 tan d2b48c teal 008080 thistle d8bfd8 tomato ff6347 turquoise 40e0d0 violet ee82ee wheat f5deb3 white ffffff whitesmoke f5f5f5 yellow ffff00 yellowgreen 9acd32"
  .split(" ")
  .flatMap((t, i, all) => (i % 2 ? [] : [{ name: t, rgb: parseHex(all[i + 1])! }]))
  .map((n) => ({ ...n, lab: rgbToLab(n.rgb) }));

function parseHex(s: string): RGB | null {
  const m = s.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  return [0, 2, 4].map((o) => parseInt(h.slice(o, o + 2), 16)) as RGB;
}

function parseColor(s: string): RGB | null {
  const t = s.trim().toLowerCase();
  const rgb = t.match(/^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/);
  if (rgb) return [rgb[1], rgb[2], rgb[3]].map((v) => Math.min(255, +v)) as RGB;
  return parseHex(t) ?? NAMES.find((n) => n.name === t)?.rgb ?? null;
}

function nearestName(rgb: RGB) {
  const lab = rgbToLab(rgb);
  return NAMES.reduce((best, n) => { const d = deltaE(lab, n.lab); return d < best.d ? { name: n.name, d } : best; }, { name: "", d: Infinity });
}

function formats(rgb: RGB): [string, string, string?][] {
  const { h, sl, l, sv, v } = hsx(rgb);
  const [L, a, b] = rgbToLab(rgb);
  const C = Math.hypot(a, b), H = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  const name = nearestName(rgb);
  const pct = (n: number) => Math.round(n * 100) + "%";
  return [
    ["HEX", hex(rgb)],
    ["RGB", `rgb(${rgb.join(", ")})`],
    ["HSL", `hsl(${Math.round(h)}, ${pct(sl)}, ${pct(l)})`],
    ["HSB", `hsb(${Math.round(h)}, ${pct(sv)}, ${pct(v)})`],
    ["OKLCH", `oklch(${round(L * 100)}% ${round(C, 3)} ${C < 0.002 ? 0 : round(H)})`],
    ["CMYK", `cmyk(${cmyk(rgb).join("%, ")}%)`],
    ["Name", name.d < 0.05 ? name.name : `${name.name} (≈ ΔE ${round(name.d)})`, name.name],
  ];
}

const closeness = (d: number) => (d < 0.05 ? "identical" : d < 2 ? "hard to tell apart" : d < 5 ? "close" : d < 10 ? "noticeable" : "clearly different");

/* ---------- honeycomb geometry ---------- */

const HEX_R = 22;
const SQ3 = Math.sqrt(3);
const RINGS = 3;
type Cell = { key: string; ring: number; x: number; y: number; ux: number; uy: number };

// Pointy-top hexes in axial coordinates. (ux, uy) is the offset in "cell steps": every ring-1 neighbour is 1 away.
const CELLS: Cell[] = [];
for (let q = -RINGS; q <= RINGS; q++)
  for (let r = -RINGS; r <= RINGS; r++) {
    const ring = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
    if (ring > RINGS) continue;
    const x = HEX_R * SQ3 * (q + r / 2), y = HEX_R * 1.5 * r;
    CELLS.push({ key: `${q},${r}`, ring, x, y, ux: x / (HEX_R * SQ3), uy: -y / (HEX_R * SQ3) });
  }
CELLS.sort((a, b) => a.ring - b.ring);

const hexPoints = (cx: number, cy: number, rad: number) =>
  Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 30);
    return `${(cx + rad * Math.cos(a)).toFixed(2)},${(cy + rad * Math.sin(a)).toFixed(2)}`;
  }).join(" ");

const MODES: Record<Mode, { label: string; title: string; axes: [top: string, right: string, bottom: string, left: string] }> = {
  ab: { label: "Hue wheel", title: "Same lightness; neighbours drift toward other hues", axes: ["+ yellow", "+ red", "+ blue", "+ green"] },
  lh: { label: "Light / hue", title: "Up/down: lighter/darker · left/right: rotate hue", axes: ["lighter", "hue →", "darker", "← hue"] },
  lc: { label: "Light / vivid", title: "Up/down: lighter/darker · left/right: duller/more vivid", axes: ["lighter", "more vivid", "darker", "duller"] },
};

function neighbour([L, a, b]: Lab, mode: Mode, step: number, c: Cell): Lab | null {
  if (mode === "ab") return [L, a + step * c.ux, b + step * c.uy];
  const C = Math.hypot(a, b), h = Math.atan2(b, a), L2 = L + step * c.uy;
  if (L2 < 0 || L2 > 1) return null;
  if (mode === "lh") {
    // Rotate by an arc of `step`; near-greys have no hue to rotate, so cap the angle.
    const h2 = h + (step * c.ux) / Math.max(C, 0.04);
    return [L2, C * Math.cos(h2), C * Math.sin(h2)];
  }
  const C2 = C + step * c.ux;
  return C2 < 0 ? null : [L2, C2 * Math.cos(h), C2 * Math.sin(h)];
}

/* ---------- photo ---------- */

const MAX_EDGE = 2400;
const SIZES = [1, 3, 5, 9];
const LOUPE = 132, LOUPE_SPAN = 15;

/** Average an n×n square in linear light, so dark and bright pixels mix the way light does. */
function sampleAt({ data, width, height }: ImageData, x: number, y: number, n: number): RGB {
  const h = (n - 1) / 2;
  let r = 0, g = 0, b = 0;
  for (let dy = -h; dy <= h; dy++)
    for (let dx = -h; dx <= h; dx++) {
      const i = (clamp(y + dy, 0, height - 1) * width + clamp(x + dx, 0, width - 1)) * 4;
      r += toLin(data[i]); g += toLin(data[i + 1]); b += toLin(data[i + 2]);
    }
  return [r, g, b].map((v) => Math.round(clamp(toSrgb(v / (n * n)), 0, 255))) as RGB;
}

function drawTo(canvas: HTMLCanvasElement, src: CanvasImageSource, w: number, h: number): ImageData {
  const k = Math.min(1, MAX_EDGE / Math.max(w, h));
  canvas.width = Math.round(w * k);
  canvas.height = Math.round(h * k);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

async function decode(file: File): Promise<{ src: CanvasImageSource; w: number; h: number }> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { src: bmp, w: bmp.width, h: bmp.height };
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return { src: img, w: img.naturalWidth, h: img.naturalHeight };
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

/** A dusk landscape with film grain, so the tool opens with something to sample. */
const SAMPLE_PICK: Point = { x: 360, y: 700 };
function sampleScene(): HTMLCanvasElement {
  const W = 1200, H = 800, c = document.createElement("canvas");
  c.width = W; c.height = H;
  const x = c.getContext("2d")!;
  const grad = (y0: number, y1: number, stops: string[]) => {
    const g = x.createLinearGradient(0, y0, 0, y1);
    stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s));
    return g;
  };
  x.fillStyle = grad(0, H * 0.62, ["#1d2a5b", "#6b4c8a", "#e07a5f", "#f2c48d"]);
  x.fillRect(0, 0, W, H);
  const sun = x.createRadialGradient(760, 430, 10, 760, 430, 160);
  sun.addColorStop(0, "rgba(255,236,190,1)"); sun.addColorStop(0.35, "rgba(255,214,150,0.9)"); sun.addColorStop(1, "rgba(255,190,120,0)");
  x.fillStyle = sun; x.fillRect(0, 0, W, H);
  const ridge = (base: number, amp: number, f1: number, f2: number, ph: number, col: string) => {
    x.beginPath(); x.moveTo(0, H);
    for (let i = 0; i <= W; i += 6) x.lineTo(i, base + amp * Math.sin(i * f1 + ph) + amp * 0.45 * Math.sin(i * f2 + ph * 2));
    x.lineTo(W, H); x.closePath(); x.fillStyle = col; x.fill();
  };
  ridge(440, 38, 0.006, 0.017, 1.2, "#8a5a7a");
  ridge(490, 30, 0.009, 0.021, 2.4, "#5e3f63");
  ridge(540, 26, 0.004, 0.013, 0.3, "#3b3150");
  x.fillStyle = grad(580, H, ["#e9a178", "#7d5a7e", "#253159"]);
  x.fillRect(0, 580, W, H - 580);
  x.fillStyle = "rgba(255,225,170,0.55)";
  for (let i = 0; i < 14; i++) x.fillRect(700 + Math.sin(i * 2.1) * 30, 600 + i * 12, 120 - i * 6, 3);
  ridge(610, 14, 0.012, 0.03, 4.1, "#2c3b2f");
  const poly = (col: string, pts: number[]) => {
    x.fillStyle = col; x.beginPath(); x.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) x.lineTo(pts[i], pts[i + 1]);
    x.closePath(); x.fill();
  };
  poly("#b84a3a", [300, 690, 420, 690, 400, 712, 318, 712]);
  poly("#f1e3c8", [360, 688, 360, 616, 404, 686]);
  const img = x.getImageData(0, 0, W, H), d = img.data;
  let seed = 7;
  for (let i = 0; i < d.length; i += 4) {
    const n = ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 16;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  x.putImageData(img, 0, 0);
  return c;
}

/* ---------- tool ---------- */

export default function ColorTool() {
  const [hashColor] = useHashState("c", "");
  const [modeParam, setModeParam] = useHashState("m", "ab");
  const [spreadParam, setSpreadParam] = useHashState("s", "3");
  const mode: Mode = modeParam in MODES ? (modeParam as Mode) : "ab";
  const spread = clamp(parseFloat(spreadParam) || 3, 0.8, 8);
  const [size, setSize] = useStored<number>("veyth:color-dropper", 5);
  const [history, setHistory] = useStored<string[]>("veyth:color-history", []);

  const [photo, setPhoto] = useState<Photo | null>(null);
  const [source, setSource] = useState<Source>(() => {
    const shared = parseHex(hashColor);
    return shared ? { kind: "manual", rgb: shared } : { kind: "photo", ...SAMPLE_PICK };
  });
  const [override, setOverride] = useState<Override | null>(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [typed, setTyped] = useState("");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const loupeRef = useRef<HTMLDivElement>(null);
  const loupeCanvasRef = useRef<HTMLCanvasElement>(null);
  const loupeHexRef = useRef<HTMLSpanElement>(null);
  const picking = useRef(false);

  const sample: RGB = useMemo(() => {
    if (source.kind === "manual") return source.rgb;
    return photo ? sampleAt(photo.data, source.x, source.y, size) : [184, 74, 58];
  }, [source, photo, size]);
  const center = override?.center ?? sample;
  const selected = override?.sel ?? center;
  const selKey = override?.key ?? "0,0";

  const cells = useMemo(() => {
    const lab = rgbToLab(center);
    return CELLS.map((c) => {
      const n = neighbour(lab, mode, spread / 100, c);
      return { ...c, rgb: n && labToRgb(n) };
    });
  }, [center, mode, spread]);
  const selCell = cells.find((c) => c.key === selKey && c.rgb);
  const dE = deltaE(rgbToLab(sample), rgbToLab(selected));

  const remember = useCallback((rgb: RGB) => setHistory((h) => [hex(rgb), ...h.filter((x) => x !== hex(rgb))].slice(0, 12)), [setHistory]);

  /** `pick` moves the dropper there; null keeps the current sample (the initial scene, or a shared colour). */
  const load = useCallback((src: CanvasImageSource, w: number, h: number, name: string, pick: Point | null) => {
    const data = drawTo(canvasRef.current!, src, w, h);
    setPhoto({ name, data });
    setOverride(null);
    if (pick) setSource({ kind: "photo", x: Math.min(pick.x, data.width - 1), y: Math.min(pick.y, data.height - 1) });
  }, []);

  const loadFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError(`${file.name || "That file"} isn't an image.`);
    try {
      const { src, w, h } = await decode(file);
      const name = file.name && file.name !== "image.png" ? file.name : "Pasted image";
      const k = Math.min(1, MAX_EDGE / Math.max(w, h));
      load(src, w, h, name, { x: Math.round((w * k) / 2), y: Math.round((h * k) / 2) });
      setError("");
    } catch {
      setError(/\.hei[cf]$/i.test(file.name) ? "HEIC only opens in Safari. Export the photo as JPG first." : `Couldn't open ${file.name || "that image"}. Is it a format this browser can read?`);
    }
  }, [load]);

  // Open with the sample scene; a shared link keeps its colour instead of sampling the boat.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const scene = sampleScene();
      load(scene, scene.width, scene.height, "Sample photo", null);
    });
    return () => cancelAnimationFrame(id);
  }, [load]);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith("image/"));
      if (!item) return;
      e.preventDefault();
      loadFile(item.getAsFile() ?? undefined);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [loadFile]);

  function applySample(rgb: RGB, src: Source, keep: boolean) {
    setSource(src);
    setOverride(null);
    if (keep) remember(rgb);
  }

  function toImage(e: PointerEvent<HTMLCanvasElement>): Point {
    const c = e.currentTarget, r = c.getBoundingClientRect();
    return {
      x: clamp(Math.floor(((e.clientX - r.left) / r.width) * c.width), 0, c.width - 1),
      y: clamp(Math.floor(((e.clientY - r.top) / r.height) * c.height), 0, c.height - 1),
    };
  }

  function showLoupe({ x, y }: Point) {
    const canvas = canvasRef.current, lc = loupeCanvasRef.current, box = loupeRef.current, frame = frameRef.current;
    if (!canvas || !lc || !box || !frame || !photo) return;
    const ctx = lc.getContext("2d")!, cell = LOUPE / LOUPE_SPAN, half = (LOUPE_SPAN - 1) / 2;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, LOUPE, LOUPE);
    ctx.drawImage(canvas, x - half, y - half, LOUPE_SPAN, LOUPE_SPAN, 0, 0, LOUPE, LOUPE);
    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < LOUPE_SPAN; i++) { ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, LOUPE); ctx.moveTo(0, i * cell); ctx.lineTo(LOUPE, i * cell); }
    ctx.stroke();
    const o = (half - (size - 1) / 2) * cell;
    ctx.strokeStyle = "#000"; ctx.lineWidth = 3; ctx.strokeRect(o, o, size * cell, size * cell);
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.strokeRect(o, o, size * cell, size * cell);
    loupeHexRef.current!.textContent = hex(sampleAt(photo.data, x, y, size));
    const fw = frame.clientWidth, fh = frame.clientHeight;
    const px = ((x + 0.5) / canvas.width) * fw, py = ((y + 0.5) / canvas.height) * fh;
    const left = px + 20 + LOUPE > fw ? px - 20 - LOUPE : px + 20;
    const top = py - 40 - LOUPE < 0 ? py + 20 : py - 40 - LOUPE;
    box.style.left = `${Math.max(0, left)}px`;
    box.style.top = `${top}px`;
    box.hidden = false;
  }
  const hideLoupe = () => { if (loupeRef.current) loupeRef.current.hidden = true; };

  function pickAt(p: Point, keep: boolean) {
    if (!photo) return;
    showLoupe(p);
    applySample(sampleAt(photo.data, p.x, p.y, size), { kind: "photo", ...p }, keep);
  }

  function onKey(e: KeyboardEvent<HTMLCanvasElement>) {
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!d || !photo) return;
    e.preventDefault();
    const at = source.kind === "photo" ? source : { x: photo.data.width >> 1, y: photo.data.height >> 1 };
    const k = e.shiftKey ? 10 : 1;
    pickAt({ x: clamp(at.x + d[0] * k, 0, photo.data.width - 1), y: clamp(at.y + d[1] * k, 0, photo.data.height - 1) }, false);
  }

  function matchTyped() {
    const rgb = parseColor(typed);
    if (!rgb) return setError(`Couldn't read "${typed}" as a colour. Try #e07a5f, rgb(224, 122, 95) or a CSS name like coral.`);
    setError("");
    applySample(rgb, { kind: "manual", rgb }, true);
  }

  const marker = photo && source.kind === "photo" ? { left: `${((source.x + 0.5) / photo.data.width) * 100}%`, top: `${((source.y + 0.5) / photo.data.height) * 100}%` } : null;

  return (
    <div className="space-y-4">
      <ToolHeader>
        <ShareButton params={{ c: hex(selected).slice(1), m: mode, s: String(spread) }} />
      </ToolHeader>

      {error ? (
        <VeyStatus mood="oops">{error}</VeyStatus>
      ) : source.kind === "photo" ? (
        <VeyStatus mood="happy">
          Sampled <span className="font-mono text-white">{hex(sample)}</span> at {source.x}, {source.y}
          {size > 1 && <> · average of {size}×{size} pixels</>}
        </VeyStatus>
      ) : (
        <VeyStatus mood="idle">Matching <span className="font-mono text-white">{hex(sample)}</span>. Drop a photo to sample from it instead.</VeyStatus>
      )}

      <div className="grid lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-4 items-start">
        <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-3 min-w-0">
          <div className="flex flex-wrap items-center gap-3 justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <label className="cursor-pointer rounded-full bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-black focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--color-accent)]">
                Upload photo
                <input type="file" accept="image/*" className="sr-only" onChange={(e) => { loadFile(e.target.files?.[0]); e.target.value = ""; }} />
              </label>
              <span className="truncate font-mono text-xs text-[var(--color-muted)]" title={photo?.name}>{photo?.name ?? "Loading…"}</span>
            </div>
            <Segmented
              size="sm"
              label="Dropper"
              options={SIZES.map((n) => ({ value: String(n), label: n === 1 ? "1 px" : `${n}×${n}`, title: n === 1 ? "Exact pixel" : `Average of ${n * n} pixels — evens out photo grain` }))}
              value={String(size)}
              onChange={(v) => { setSize(+v); setOverride(null); }}
            />
          </div>

          <div
            className={`relative grid min-h-60 place-items-center rounded-xl bg-[repeating-conic-gradient(#27272a_0_25%,#18181b_0_50%)] bg-[length:16px_16px] ${dragging ? "outline-2 outline-dashed outline-[var(--color-accent)]" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); loadFile(e.dataTransfer.files[0]); }}
          >
            <div ref={frameRef} className="relative max-w-full">
              <canvas
                ref={canvasRef}
                tabIndex={0}
                aria-label="Photo. Click or drag to sample a colour; arrow keys move the dropper."
                className="block h-auto max-h-[68vh] w-auto max-w-full cursor-crosshair touch-none rounded-lg focus:outline-none focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
                onPointerDown={(e) => { if (!photo) return; picking.current = true; e.currentTarget.setPointerCapture(e.pointerId); pickAt(toImage(e), false); }}
                onPointerMove={(e) => { if (!photo) return; const p = toImage(e); if (picking.current) pickAt(p, false); else if (e.pointerType === "mouse") showLoupe(p); }}
                onPointerUp={(e) => { if (!picking.current) return; picking.current = false; pickAt(toImage(e), true); if (e.pointerType !== "mouse") hideLoupe(); }}
                onPointerCancel={() => { picking.current = false; hideLoupe(); }}
                onPointerLeave={() => { if (!picking.current) hideLoupe(); }}
                onKeyDown={onKey}
                onKeyUp={(e) => { if (e.key.startsWith("Arrow")) { remember(sample); hideLoupe(); } }}
                onBlur={hideLoupe}
              />
              {marker && (
                <div className="pointer-events-none absolute -ml-[9px] -mt-[9px] h-[18px] w-[18px] rounded-full border-2 border-white shadow-[0_0_0_1.5px_#000,inset_0_0_0_1.5px_#000]" style={marker} />
              )}
              <div ref={loupeRef} hidden className="pointer-events-none absolute z-10 grid justify-items-center gap-1">
                <canvas ref={loupeCanvasRef} width={LOUPE} height={LOUPE} className="rounded-full border-2 border-white bg-black shadow-[0_0_0_1px_#000,0_6px_20px_rgba(0,0,0,0.5)] [image-rendering:pixelated]" style={{ width: LOUPE, height: LOUPE }} />
                <span ref={loupeHexRef} className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 font-mono text-xs font-semibold" />
              </div>
            </div>
          </div>
          <p className="text-xs text-[var(--color-muted)]">
            <b className="text-white">Click or drag</b> on the photo to sample. Drop an image here or paste one with ⌘V. Arrow keys nudge the dropper one pixel (Shift for ten).
          </p>

          <Panel label="Recent" meta="kept in this browser" actions={history.length > 0 && <button className={btnSm} onClick={() => setHistory([])}>Clear</button>}>
            <div className="flex min-h-7 flex-wrap items-center gap-1.5">
              {history.length ? history.map((h) => (
                <button
                  key={h}
                  title={h}
                  aria-label={`Match ${h}`}
                  onClick={() => { const rgb = parseHex(h)!; applySample(rgb, { kind: "manual", rgb }, false); }}
                  className="h-7 w-7 rounded-md border border-white/15 transition hover:scale-110"
                  style={{ background: h }}
                />
              )) : <span className="text-xs text-zinc-600">Colours you sample show up here.</span>}
            </div>
          </Panel>
        </section>

        <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-4 min-w-0">
          <div>
            <div className="grid h-24 grid-cols-2 overflow-hidden rounded-xl border border-[var(--color-border)]" aria-live="polite">
              {([["Sample", sample], ["Selected", selected]] as const).map(([label, rgb]) => (
                <div key={label} className="flex flex-col justify-end px-3 py-2" style={{ background: hex(rgb), color: isLight(rgb) ? "#0a0a0a" : "#fff" }}>
                  <span className="text-[11px] font-semibold uppercase tracking-wider">{label}</span>
                  <span className="font-mono text-sm font-semibold">{hex(rgb)}</span>
                </div>
              ))}
            </div>
            <div className="mt-1.5 flex justify-between gap-2 text-xs text-[var(--color-muted)] tabular-nums">
              <span>Distance from sample</span>
              <span><b className="text-white">{round(dE)}</b> ΔE · {closeness(dE)}</span>
            </div>
          </div>

          <svg viewBox="-200 -142 400 284" className="mx-auto block h-auto w-full max-w-[460px] overflow-visible" role="group" aria-label="Nearby colours">
            {MODES[mode].axes.map((t, i) => (
              <text
                key={i}
                x={[0, 142, 0, -142][i]}
                y={[-132, 0, 134, 0][i]}
                textAnchor={(["middle", "start", "middle", "end"] as const)[i]}
                dominantBaseline="middle"
                className="fill-[var(--color-muted)] text-[10px] tracking-wide"
              >
                {t}
              </text>
            ))}
            {cells.map((c) =>
              c.rgb ? (
                <g
                  key={c.key}
                  role="button"
                  tabIndex={0}
                  aria-label={`${hex(c.rgb)}${c.ring ? `, ring ${c.ring}` : ", centre"}`}
                  className="cursor-pointer transition-transform [transform-box:fill-box] [transform-origin:center] hover:scale-[1.07] focus:outline-none focus-visible:scale-[1.07] motion-reduce:transition-none"
                  onClick={() => setOverride({ center, sel: c.rgb!, key: c.key })}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOverride({ center, sel: c.rgb!, key: c.key }); } }}
                >
                  <title>{hex(c.rgb)}</title>
                  <polygon points={hexPoints(c.x, c.y, HEX_R - 1.6)} fill={hex(c.rgb)} />
                  {c.ring === 0 && <circle cx={c.x} cy={c.y} r={3} fill={isLight(c.rgb) ? "#0a0a0a" : "#fff"} />}
                </g>
              ) : (
                <g key={c.key}>
                  <title>Outside the colours a screen can show</title>
                  <polygon points={hexPoints(c.x, c.y, HEX_R - 1.6)} fill="none" stroke="var(--color-border)" strokeDasharray="3 3" />
                </g>
              ),
            )}
            {selCell && [[5, "#0a0a0a"], [2.2, "#fff"]].map(([w, col]) => (
              <polygon key={col} points={hexPoints(selCell.x, selCell.y, HEX_R - 1.6)} fill="none" stroke={String(col)} strokeWidth={w} strokeLinejoin="round" pointerEvents="none" />
            ))}
          </svg>

          <div className="space-y-3">
            <Segmented
              size="sm"
              label="Grid"
              options={(Object.keys(MODES) as Mode[]).map((m) => ({ value: m, label: MODES[m].label, title: MODES[m].title }))}
              value={mode}
              onChange={(m) => { setModeParam(m); setOverride(override && { center: override.center, sel: override.center, key: "0,0" }); }}
            />
            <label className="flex items-center gap-3 text-xs text-[var(--color-muted)]">
              Spread
              <input
                type="range"
                min={0.8}
                max={8}
                step={0.2}
                value={spread}
                onChange={(e) => { setSpreadParam(e.target.value); setOverride(override && { center: override.center, sel: override.center, key: "0,0" }); }}
                className="min-w-0 flex-1 accent-[var(--color-accent)]"
              />
              <span className="w-14 text-right font-mono tabular-nums">{round(spread)} ΔE</span>
            </label>
            <div className="flex flex-wrap gap-2">
              <button className={btn} disabled={same(selected, center)} onClick={() => setOverride({ center: selected, sel: selected, key: "0,0" })} title="Build new rings around the colour you picked">
                Centre on selected
              </button>
              <button className={btn} disabled={!override} onClick={() => setOverride(null)}>Back to sample</button>
            </div>
          </div>

          <dl className="divide-y divide-[var(--color-border)]">
            {formats(selected).map(([k, v, copy]) => (
              <div key={k} className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-3 py-1.5">
                <dt className="font-mono text-[11px] uppercase tracking-wide text-[var(--color-muted)]">{k}</dt>
                <dd className="break-words font-mono text-sm tabular-nums">{v}</dd>
                <CopyButton text={copy ?? v} small />
              </div>
            ))}
          </dl>

          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); matchTyped(); }}>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="Or type a colour: #e07a5f, rgb(…), coral"
              spellCheck={false}
              autoComplete="off"
              aria-label="Colour to match"
              className={`${fieldCls} min-w-0 flex-1 py-1.5`}
            />
            <button type="submit" className={btn} disabled={!typed.trim()}>Match</button>
          </form>
        </section>
      </div>

      <p className="text-xs text-zinc-600">
        Sampled with the Canvas API in this tab — the photo is never uploaded. Photos are scaled to at most {MAX_EDGE} px on the longest side.
        Nearby colours are spaced evenly in OKLab, so each ring is about one spread step further away to the eye; dashed cells fall outside sRGB.
        CMYK is a plain formula, not a print profile — check against a swatch before ordering paint or print.
      </p>
    </div>
  );
}
