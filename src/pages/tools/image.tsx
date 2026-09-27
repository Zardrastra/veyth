import { useEffect, useMemo, useRef, useState } from "react";
import { Panel, Segmented, Toggle, ToolHeader, VeyStatus, btn, btnSm, fieldCls } from "../../components/ui";
import { formatBytes } from "../../lib/format";
import { useStored } from "../../lib/storage";
import { zipFiles } from "../../lib/zip";

// Everything happens on a <canvas> in this tab: decode → resize → re-encode. Files are never
// uploaded, and re-encoding drops EXIF metadata (camera, GPS location) as a side effect.

type Mode = "original" | "percent" | "edge" | "box";
type Format = "same" | "image/jpeg" | "image/png" | "image/webp" | "image/avif";
type Settings = {
  mode: Mode; percent: number; edge: number; width: string; height: string; keep: boolean; enlarge: boolean; format: Format; quality: number; bg: string;
  target: boolean; targetKB: number; shrink: boolean;
};

const DEFAULTS: Settings = { mode: "edge", percent: 50, edge: 1920, width: "1280", height: "", keep: true, enlarge: false, format: "same", quality: 85, bg: "#ffffff", target: false, targetKB: 500, shrink: true };

const FORMATS: { value: Exclude<Format, "same">; label: string; ext: string; lossy: boolean; alpha: boolean }[] = [
  { value: "image/jpeg", label: "JPG", ext: "jpg", lossy: true, alpha: false },
  { value: "image/png", label: "PNG", ext: "png", lossy: false, alpha: true },
  { value: "image/webp", label: "WebP", ext: "webp", lossy: true, alpha: true },
  { value: "image/avif", label: "AVIF", ext: "avif", lossy: true, alpha: true },
];
const EDGE_PRESETS = [3840, 2560, 1920, 1280, 1080, 800, 512];
const PERCENT_PRESETS = [25, 50, 75];
const TARGET_PRESETS = [100, 200, 500, 1024, 2048, 5120];

type Source = ImageBitmap | HTMLImageElement;
type Out = { key: string; blob: Blob; url: string; w: number; h: number; name: string; quality?: number; missed?: boolean };
type Item = { id: number; file: File; src: Source; w: number; h: number; out?: Out; error?: string };

/** Which output types this browser's canvas can actually encode (it silently falls back to PNG otherwise). */
function useEncodable() {
  const [ok, setOk] = useState<Set<string>>(() => new Set(["image/jpeg", "image/png"]));
  useEffect(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 1;
    Promise.all(FORMATS.map((f) => new Promise<string | null>((res) => c.toBlob((b) => res(b?.type === f.value ? f.value : null), f.value)))).then((types) =>
      setOk(new Set(types.filter((t): t is string => !!t))),
    );
  }, []);
  return ok;
}

async function decode(file: File): Promise<Source> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // SVG and a few other types only decode through an <img>.
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

function sizeOf(src: Source): [number, number] {
  return src instanceof HTMLImageElement ? [src.naturalWidth, src.naturalHeight] : [src.width, src.height];
}

function targetSize(w: number, h: number, s: Settings): [number, number] {
  let sx = 1, sy = 1;
  if (s.mode === "percent") sx = sy = s.percent / 100;
  else if (s.mode === "edge") sx = sy = s.edge / Math.max(w, h);
  else if (s.mode === "box") {
    const W = parseInt(s.width) || 0, H = parseInt(s.height) || 0;
    if (s.keep) {
      const k = Math.min(W ? W / w : Infinity, H ? H / h : Infinity);
      if (Number.isFinite(k)) sx = sy = k;
    } else {
      if (W) sx = W / w;
      if (H) sy = H / h;
    }
  }
  if (!s.enlarge) { sx = Math.min(sx, 1); sy = Math.min(sy, 1); }
  return [Math.max(1, Math.round(w * sx)), Math.max(1, Math.round(h * sy))];
}

function outType(file: File, s: Settings, ok: Set<string>): string {
  if (s.format !== "same") return ok.has(s.format) ? s.format : "image/png";
  return ok.has(file.type) ? file.type : "image/png";
}

/** Downscale in halving steps — a single big jump with canvas smoothing looks jagged. */
function render(src: Source, w: number, h: number, type: string, bg: string): HTMLCanvasElement {
  const [sw, sh] = sizeOf(src);
  let cur: CanvasImageSource = src, cw = sw, ch = sh;
  while (cw / 2 >= w && ch / 2 >= h) {
    const step = document.createElement("canvas");
    step.width = cw = Math.round(cw / 2);
    step.height = ch = Math.round(ch / 2);
    const ctx = step.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(cur, 0, 0, cw, ch);
    cur = step;
  }
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d")!;
  // JPEG has no transparency — flatten onto a colour instead of letting it go black.
  if (!FORMATS.find((f) => f.value === type)?.alpha) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(cur, 0, 0, w, h);
  return out;
}

function encode(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("encode failed"))), type, quality));
}

type Encoded = { blob: Blob; w: number; h: number; quality?: number; missed?: boolean };

/** The highest quality (between the floor and the slider) that fits `limit` at this size. */
async function bestQuality(src: Source, w: number, h: number, type: string, s: Settings, limit: number, floor: number): Promise<Encoded> {
  const canvas = render(src, w, h, type, s.bg);
  if (!FORMATS.find((f) => f.value === type)?.lossy) return { blob: await encode(canvas, type, 1), w, h };
  const ceil = s.quality / 100;
  const top = await encode(canvas, type, ceil);
  if (top.size <= limit) return { blob: top, w, h, quality: ceil };
  let best: Encoded = { blob: await encode(canvas, type, floor), w, h, quality: floor };
  if (best.blob.size > limit) return best;
  let lo = floor, hi = ceil;
  for (let i = 0; i < 6; i++) {
    const mid = (lo + hi) / 2;
    const b = await encode(canvas, type, mid);
    if (b.size <= limit) { best = { blob: b, w, h, quality: mid }; lo = mid; } else hi = mid;
  }
  return best;
}

/**
 * Hit a file-size limit: lower the quality first, and if even the floor is too big, find the
 * largest dimensions that fit. With shrinking allowed the floor is higher — fewer pixels look
 * better than blocky artefacts.
 */
async function encodeToFit(src: Source, w: number, h: number, type: string, s: Settings): Promise<Encoded> {
  const limit = s.targetKB * 1024;
  const floor = Math.min(s.quality / 100, s.shrink ? 0.5 : 0.05);
  const at = (k: number) => bestQuality(src, Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k)), type, s, limit, floor);

  let last = await at(1);
  if (last.blob.size <= limit || !s.shrink) return { ...last, missed: last.blob.size > limit };

  // File size scales roughly with pixel count: jump down by √(ratio) until something fits…
  let fail = 1, fit = 0, k = 1;
  let best: Encoded | null = null;
  for (let i = 0; i < 10 && !best && Math.max(w, h) * k > 16; i++) {
    k *= Math.min(0.95, Math.sqrt(limit / last.blob.size));
    last = await at(k);
    if (last.blob.size <= limit) { best = last; fit = k; } else fail = k;
  }
  if (!best) return { ...last, missed: true };
  // …then bisect back up to the largest size that still fits.
  for (let i = 0; i < 5; i++) {
    const mid = (fit + fail) / 2;
    const r = await at(mid);
    if (r.blob.size <= limit) { best = r; fit = mid; } else fail = mid;
  }
  return { ...best, missed: false };
}

function outName(file: File, w: number, h: number, sw: number, sh: number, type: string) {
  const base = file.name.replace(/\.[^.]+$/, "") || "image";
  const ext = FORMATS.find((f) => f.value === type)?.ext ?? "png";
  return w === sw && h === sh ? `${base}.${ext}` : `${base}-${w}x${h}.${ext}`;
}

function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

/** "photo.jpg", "photo.jpg" → "photo.jpg", "photo (2).jpg" so a zip doesn't overwrite entries. */
function uniqueNames(names: string[]) {
  const seen = new Map<string, number>();
  return names.map((n) => {
    const count = seen.get(n) ?? 0;
    seen.set(n, count + 1);
    return count ? n.replace(/(\.[^.]+)?$/, ` (${count + 1})$1`) : n;
  });
}

function change(from: number, to: number) {
  const pct = Math.round((to / from - 1) * 100);
  return { text: pct === 0 ? "±0%" : `${pct > 0 ? "+" : "−"}${Math.abs(pct)}%`, bigger: pct > 0 };
}

let nextId = 1;

export default function ImageTool() {
  const [stored, setS] = useStored<Settings>("veyth:image", DEFAULTS);
  // Settings saved by an older version may lack newer fields.
  const s = useMemo(() => ({ ...DEFAULTS, ...stored }), [stored]);
  const set = (patch: Partial<Settings>) => setS((prev) => ({ ...prev, ...patch }));
  const ok = useEncodable();
  const [items, setItems] = useState<Item[]>([]);
  const [failed, setFailed] = useState<string[]>([]);
  const [loading, setLoading] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [zipping, setZipping] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function addFiles(list: FileList | File[] | null | undefined) {
    const files = Array.from(list ?? []);
    if (!files.length) return;
    setLoading((n) => n + files.length);
    const bad: string[] = [];
    for (const file of files) {
      try {
        const src = await decode(file);
        const [w, h] = sizeOf(src);
        if (!w || !h) throw new Error("no size");
        setItems((prev) => [...prev, { id: nextId++, file, src, w, h }]);
      } catch {
        bad.push(file.name);
      }
      setLoading((n) => n - 1);
    }
    setFailed(bad);
  }

  // ⌘V an image (e.g. a screenshot) anywhere on the page.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
      if (!files.length) return;
      e.preventDefault();
      addFiles(files.map((f) => (f.name && f.name !== "image.png" ? f : new File([f], `pasted-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-")}.${f.type.split("/")[1]}`, { type: f.type }))));
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });

  const itemsRef = useRef(items);
  useEffect(() => { itemsRef.current = items; }, [items]);
  // Free object URLs when leaving the page.
  useEffect(() => () => itemsRef.current.forEach((it) => it.out && URL.revokeObjectURL(it.out.url)), []);

  // Re-render every image whose output is stale for the current settings, debounced for sliders.
  // Keyed on the set of images rather than `items`, so storing each result doesn't restart the batch.
  const settingsKey = JSON.stringify(s) + [...ok].join();
  const idsKey = items.map((it) => it.id).join();
  useEffect(() => {
    const stale = itemsRef.current.filter((it) => !it.error && it.out?.key !== settingsKey);
    if (!stale.length) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      for (const it of stale) {
        const type = outType(it.file, s, ok);
        const [w, h] = targetSize(it.w, it.h, s);
        let out: Out | undefined, error: string | undefined;
        try {
          const r: Encoded = s.target ? await encodeToFit(it.src, w, h, type, s) : { blob: await encode(render(it.src, w, h, type, s.bg), type, s.quality / 100), w, h };
          out = { ...r, key: settingsKey, url: URL.createObjectURL(r.blob), name: outName(it.file, r.w, r.h, it.w, it.h, type) };
        } catch {
          error = `Couldn't render at ${w}×${h} — too large for this browser's canvas`;
        }
        if (cancelled) {
          if (out) URL.revokeObjectURL(out.url);
          return;
        }
        setItems((prev) => prev.map((p) => (p.id === it.id ? { ...p, out: out ?? p.out, error } : p)));
        if (it.out) URL.revokeObjectURL(it.out.url);
      }
    }, 120);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [idsKey, s, ok, settingsKey]);

  function remove(id: number) {
    setItems((prev) => {
      const it = prev.find((p) => p.id === id);
      if (it?.out) URL.revokeObjectURL(it.out.url);
      return prev.filter((p) => p.id !== id);
    });
  }

  function clear() {
    items.forEach((it) => it.out && URL.revokeObjectURL(it.out.url));
    setItems([]);
    setFailed([]);
  }

  const done = items.filter((it) => it.out?.key === settingsKey);
  const ready = items.length > 0 && done.length === items.length;
  const before = items.reduce((n, it) => n + it.file.size, 0);
  const after = done.reduce((n, it) => n + it.out!.blob.size, 0);
  const missed = done.filter((it) => it.out!.missed).length;

  async function downloadAll() {
    if (done.length === 1) return download(done[0].out!.blob, done[0].out!.name);
    setZipping(true);
    const names = uniqueNames(done.map((it) => it.out!.name));
    download(await zipFiles(done.map((it, i) => ({ name: names[i], blob: it.out!.blob }))), "veyth-images.zip");
    setZipping(false);
  }

  const fmt = FORMATS.find((f) => f.value === s.format);
  const lossy = s.format === "same" ? items.some((it) => FORMATS.find((f) => f.value === outType(it.file, s, ok))?.lossy) || items.length === 0 : fmt?.lossy;
  const flattens = s.format === "image/jpeg" || (s.format === "same" && items.some((it) => it.file.type === "image/jpeg"));

  return (
    <div className="space-y-4">
      <ToolHeader />

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
        onClick={() => fileRef.current?.click()}
        className={`cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center text-sm transition ${dragging ? "border-[var(--color-accent)] bg-[var(--color-accent)]/5" : "border-[var(--color-border)] hover:border-zinc-500"}`}
      >
        <input ref={fileRef} type="file" accept="image/*,.heic,.heif,.avif" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        {loading ? "Reading…" : (
          <span className="text-[var(--color-muted)]">
            Drop images here, <u>choose files</u> or paste with ⌘V — JPG, PNG, WebP, AVIF, GIF, BMP, SVG.
            <br />
            <span className="text-zinc-500">They're processed in this tab and never uploaded.</span>
          </span>
        )}
      </div>

      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 grid md:grid-cols-2 gap-6">
        <Panel label="Resize">
          <Segmented
            size="sm"
            options={[
              { value: "original", label: "Keep size" },
              { value: "percent", label: "Percent" },
              { value: "edge", label: "Longest side", title: "Scale so the longer edge is this many pixels" },
              { value: "box", label: "Width × height" },
            ]}
            value={s.mode}
            onChange={(mode) => set({ mode })}
          />
          <div className="min-h-[76px] space-y-3 pt-1">
            {s.mode === "original" && <p className="text-sm text-zinc-500">Dimensions stay the same — just convert or compress.</p>}
            {s.mode === "percent" && (
              <div className="flex flex-wrap items-center gap-2">
                <input type="range" min={1} max={200} value={s.percent} onChange={(e) => set({ percent: +e.target.value })} className="w-40 accent-[var(--color-accent)]" aria-label="Scale percent" />
                <input type="number" min={1} max={1000} value={s.percent} onChange={(e) => set({ percent: Math.max(1, +e.target.value || 1) })} className={fieldCls + " w-20 py-1"} aria-label="Scale percent" />
                <span className="text-sm text-[var(--color-muted)]">%</span>
                {PERCENT_PRESETS.map((p) => <button key={p} className={btnSm} onClick={() => set({ percent: p })}>{p}%</button>)}
              </div>
            )}
            {s.mode === "edge" && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input type="number" min={1} value={s.edge} onChange={(e) => set({ edge: Math.max(1, +e.target.value || 1) })} className={fieldCls + " w-28 py-1"} aria-label="Longest side in pixels" />
                  <span className="text-sm text-[var(--color-muted)]">px</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {EDGE_PRESETS.map((p) => <button key={p} className={btnSm} onClick={() => set({ edge: p })}>{p}</button>)}
                </div>
              </div>
            )}
            {s.mode === "box" && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input inputMode="numeric" value={s.width} onChange={(e) => set({ width: e.target.value.replace(/\D/g, "") })} placeholder="auto" className={fieldCls + " w-24 py-1"} aria-label="Width in pixels" />
                  <span className="text-[var(--color-muted)]">×</span>
                  <input inputMode="numeric" value={s.height} onChange={(e) => set({ height: e.target.value.replace(/\D/g, "") })} placeholder="auto" className={fieldCls + " w-24 py-1"} aria-label="Height in pixels" />
                  <span className="text-sm text-[var(--color-muted)]">px</span>
                </div>
                <Toggle checked={s.keep} onChange={(keep) => set({ keep })}>
                  {s.keep ? "Keep proportions — fit inside" : "Stretch to exact size"}
                </Toggle>
              </div>
            )}
          </div>
          {s.mode !== "original" && (
            <Toggle checked={s.enlarge} onChange={(enlarge) => set({ enlarge })} title="Upscaling can't add detail — it only makes files bigger">
              Allow enlarging smaller images
            </Toggle>
          )}
        </Panel>

        <Panel label="Convert to">
          <Segmented
            size="sm"
            options={[
              { value: "same" as Format, label: "Same as input", title: "Formats the browser can't write (GIF, BMP, SVG, HEIC) become PNG" },
              ...FORMATS.filter((f) => ok.has(f.value) || f.value !== "image/avif").map((f) => ({
                value: f.value as Format,
                label: ok.has(f.value) ? f.label : <s>{f.label}</s>,
                title: ok.has(f.value) ? undefined : `This browser can't encode ${f.label} — you'd get PNG`,
              })),
            ]}
            value={s.format}
            onChange={(format) => set({ format })}
          />
          <div className="space-y-3 pt-1">
            {lossy ? (
              <div className="flex items-center gap-3">
                <span className="text-sm text-[var(--color-muted)] w-14" title={s.target ? "The highest quality that still fits the size limit is picked for each image, up to this" : undefined}>{s.target ? "Max q." : "Quality"}</span>
                <input type="range" min={1} max={100} value={s.quality} onChange={(e) => set({ quality: +e.target.value })} className="w-40 accent-[var(--color-accent)]" aria-label={s.target ? "Maximum quality" : "Quality"} />
                <span className="font-mono text-sm w-8">{s.quality}</span>
                <span className="text-xs text-zinc-500">{s.quality >= 90 ? "near-lossless" : s.quality >= 75 ? "good balance" : s.quality >= 50 ? "small files" : "tiny, visibly lossy"}</span>
              </div>
            ) : (
              <p className="text-sm text-zinc-500">PNG is lossless — no quality setting. Photos will be large; try WebP or JPG.</p>
            )}
            <div className="space-y-2 pt-1">
              <Toggle checked={s.target} onChange={(target) => set({ target })} title="Compress each image until it's no bigger than this">
                Limit file size
              </Toggle>
              {s.target && (
                <div className="space-y-2 pl-11">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-[var(--color-muted)]">≤</span>
                    <input type="number" min={1} value={s.targetKB} onChange={(e) => set({ targetKB: Math.max(1, +e.target.value || 1) })} className={fieldCls + " w-24 py-1"} aria-label="Maximum file size in KB" />
                    <span className="text-sm text-[var(--color-muted)]">KB per image</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {TARGET_PRESETS.map((kb) => (
                      <button key={kb} className={btnSm} onClick={() => set({ targetKB: kb })}>{kb >= 1024 ? `${kb / 1024} MB` : `${kb} KB`}</button>
                    ))}
                  </div>
                  <Toggle checked={s.shrink} onChange={(shrink) => set({ shrink })} title="Lower quality first, then reduce the pixel dimensions if it still doesn't fit">
                    Also shrink dimensions if needed
                  </Toggle>
                  {!lossy && !s.shrink && <p className="text-xs text-amber-300/80">PNG can only get smaller by losing pixels — turn on shrinking or pick JPG/WebP.</p>}
                </div>
              )}
            </div>
            {flattens && (
              <label className="flex items-center gap-3 text-sm text-[var(--color-muted)]">
                <span className="w-14">Fill</span>
                <input type="color" value={s.bg} onChange={(e) => set({ bg: e.target.value })} className="h-7 w-10 rounded bg-transparent cursor-pointer" />
                <span className="text-xs text-zinc-500">JPG has no transparency — see-through areas get this colour</span>
              </label>
            )}
          </div>
        </Panel>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {failed.length ? (
          <VeyStatus mood="oops">
            Couldn't open {failed.join(", ")}. {failed.some((n) => /\.hei[cf]$/i.test(n)) ? "HEIC only opens in Safari — or set your iPhone camera to “Most Compatible”." : "Is it an image this browser can read?"}
          </VeyStatus>
        ) : !items.length ? (
          <VeyStatus mood="idle">Add some images to get started.</VeyStatus>
        ) : !ready ? (
          <VeyStatus mood="idle">Processing {done.length}/{items.length}…</VeyStatus>
        ) : (
          <VeyStatus mood="happy">
            {items.length} image{items.length > 1 ? "s" : ""} · {formatBytes(before)} → <b className="text-white">{formatBytes(after)}</b>{" "}
            <span className={change(before, after).bigger ? "text-amber-300" : "text-[var(--color-accent)]"}>({change(before, after).text})</span>
            {s.target && (missed ? <span className="text-amber-300"> · {missed} over {formatBytes(s.targetKB * 1024)}</span> : <> · all under {formatBytes(s.targetKB * 1024)}</>)}
          </VeyStatus>
        )}
        {items.length > 0 && (
          <div className="flex gap-2">
            <button className={btn} onClick={clear}>Clear</button>
            <button onClick={downloadAll} disabled={!ready || zipping} className="px-3 py-1.5 text-sm rounded-full bg-[var(--color-accent)] text-black font-medium disabled:opacity-40 disabled:pointer-events-none">
              {zipping ? "Zipping…" : items.length > 1 ? `Download all (.zip)` : "Download"}
            </button>
          </div>
        )}
      </div>

      {items.length > 0 && (
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map((it) => {
            const out = it.out;
            const fresh = out?.key === settingsKey;
            const delta = out && change(it.file.size, out.blob.size);
            return (
              <li key={it.id} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden flex flex-col min-w-0">
                <div className="relative aspect-[4/3] bg-[repeating-conic-gradient(#27272a_0_25%,#18181b_0_50%)] bg-[length:16px_16px]">
                  {out && <img src={out.url} alt={it.file.name} className={`absolute inset-0 h-full w-full object-contain transition ${fresh ? "" : "opacity-50"}`} />}
                  <button onClick={() => remove(it.id)} className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/60 text-zinc-300 hover:text-white text-sm" aria-label={`Remove ${it.file.name}`}>✕</button>
                </div>
                <div className="p-3 space-y-2 text-xs flex-1 flex flex-col">
                  <div className="font-mono truncate text-sm" title={it.file.name}>{it.file.name}</div>
                  <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[var(--color-muted)]">
                    <span>Before</span>
                    <span className="font-mono">{it.w}×{it.h} · {formatBytes(it.file.size)}</span>
                    <span>After</span>
                    <span className="font-mono text-white">
                      {out ? <>{out.w}×{out.h} · {formatBytes(out.blob.size)} <span className={delta!.bigger ? "text-amber-300" : "text-[var(--color-accent)]"}>{delta!.text}</span></> : "…"}
                    </span>
                  </div>
                  {fresh && s.target && (
                    <div className="text-zinc-500">
                      {[
                        out!.quality !== undefined && `quality ${Math.round(out!.quality * 100)}`,
                        (out!.w < targetSize(it.w, it.h, s)[0] || out!.h < targetSize(it.w, it.h, s)[1]) && "shrunk to fit",
                      ].filter(Boolean).join(" · ")}
                    </div>
                  )}
                  {fresh && out!.missed && (
                    <p className="text-amber-300">Still over {formatBytes(s.targetKB * 1024)}{s.shrink ? "." : " — turn on “Also shrink dimensions”."}</p>
                  )}
                  {it.error && <p className="text-red-300">{it.error}</p>}
                  {fresh && !s.target && delta!.bigger && out!.w * out!.h <= it.w * it.h && (
                    <p className="text-amber-300/80">Bigger than the original — try a lossy format or lower quality.</p>
                  )}
                  <button className={btnSm + " mt-auto self-start"} disabled={!fresh} onClick={() => download(out!.blob, out!.name)}>
                    ↓ {out?.name ?? "Download"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs text-zinc-600">
        Resized with the Canvas API in this tab — no upload, no server. Metadata (EXIF, camera, GPS location) is removed from every output.
        Animated GIFs keep only their first frame. Your settings are remembered in this browser.
      </p>
    </div>
  );
}
