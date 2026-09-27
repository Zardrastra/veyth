import { useEffect, useMemo, useRef, useState } from "react";
import { useHashState } from "../../lib/share";
import { base64ToBytes, bytesToBase64, bytesToHex } from "../../lib/codec";
import { CopyButton, Panel, Segmented, ShareButton, Toggle, ToolHeader, btnSm, fieldCls } from "../../components/ui";
import { formatBytes } from "../../lib/format";
import { useFlash } from "../../lib/useFlash";

// ---------- UUIDs ----------

type Version = "v4" | "v7";

function uuid7(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  const ts = Date.now();
  for (let i = 0; i < 6; i++) b[i] = Math.floor(ts / 2 ** (8 * (5 - i))) & 0xff;
  b[6] = (b[6] & 0x0f) | 0x70;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = bytesToHex(b);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function generate(version: Version, n: number): string[] {
  const list = Array.from({ length: n }, version === "v7" ? uuid7 : () => crypto.randomUUID());
  // v7 is meant to sort by creation time; ids from the same millisecond get random tails, so sort the batch.
  return version === "v7" ? list.sort() : list;
}

function format(u: string, upper: boolean, hyphens: boolean, braces: boolean) {
  let s = hyphens ? u : u.replace(/-/g, "");
  if (upper) s = s.toUpperCase();
  return braces ? `{${s}}` : s;
}

const VERSION_HINT: Record<Version, string> = {
  v4: "122 random bits. The safe default for IDs, tokens and keys.",
  v7: "Starts with a millisecond timestamp, so IDs sort by creation time — better for database primary keys.",
};

function inspect(input: string) {
  const s = input.trim().replace(/^[{(<"']|[})>"']$/g, "").replace(/^urn:uuid:/i, "");
  const hex = s.replace(/-/g, "");
  if (!/^[0-9a-f]{32}$/i.test(hex)) return { valid: false as const, reason: s.length ? "Not a UUID — expected 32 hex digits (with or without hyphens)." : "" };
  const version = parseInt(hex[12], 16);
  const v = parseInt(hex[16], 16);
  const variant = v < 8 ? "NCS (legacy)" : v < 12 ? "RFC 9562" : v < 14 ? "Microsoft (legacy)" : "Reserved";
  const rows: [string, string][] = [
    ["Canonical", `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`.toLowerCase()],
    ["Version", hex === "0".repeat(32) ? "Nil UUID" : /^f{32}$/i.test(hex) ? "Max UUID" : `${version} — ${["", "time + MAC", "DCE security", "MD5 name-based", "random", "SHA-1 name-based", "reordered time", "Unix time + random", "custom"][version] ?? "unknown"}`],
    ["Variant", variant],
  ];
  if (version === 7) {
    const ms = parseInt(hex.slice(0, 12), 16);
    rows.push(["Created", `${new Date(ms).toISOString()} (${new Date(ms).toLocaleString()})`]);
  } else if (version === 1) {
    const t = BigInt("0x" + hex.slice(13, 16) + hex.slice(8, 12) + hex.slice(0, 8));
    const ms = Number((t - 122192928000000000n) / 10000n);
    rows.push(["Created", new Date(ms).toISOString()]);
  }
  return { valid: true as const, rows };
}

function UuidSection() {
  const [version, setVersionState] = useState<Version>("v4");
  const [count, setCountState] = useState(5);
  const [upper, setUpper] = useState(false);
  const [hyphens, setHyphens] = useState(true);
  const [braces, setBraces] = useState(false);
  const [raw, setRaw] = useState<string[]>(() => generate("v4", 5));
  const [copied, flash] = useFlash(1200);

  const setVersion = (v: Version) => { setVersionState(v); setRaw(generate(v, count)); };
  const setCount = (n: number) => { setCountState(n); setRaw(generate(version, n)); };

  const list = raw.map((u) => format(u, upper, hyphens, braces));

  return (
    <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">UUID generator</h2>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setRaw(generate(version, count))} className="px-4 py-1.5 rounded-full bg-[var(--color-accent)] text-black text-sm font-medium">↻ Generate</button>
          <CopyButton text={list.join("\n")} label={`Copy ${list.length > 1 ? "all" : ""}`} />
          {list.length > 1 && <CopyButton text={JSON.stringify(list)} label="Copy as JSON" />}
        </div>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-3 items-center">
        <Segmented
          label="Version"
          options={[{ value: "v4", label: "v4 · random" }, { value: "v7", label: "v7 · time-sorted" }]}
          value={version}
          onChange={setVersion}
        />
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--color-muted)]">How many</span>
          <Segmented size="sm" options={["1", "5", "10", "25", "100"].map((n) => ({ value: n, label: n }))} value={String(count)} onChange={(v) => setCount(Number(v))} />
          <input
            type="number"
            min={1}
            max={1000}
            value={count}
            onChange={(e) => setCount(Math.max(1, Math.min(1000, Number(e.target.value) || 1)))}
            className="w-20 bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-full px-3 py-1 text-sm"
            aria-label="Custom count"
          />
        </div>
      </div>
      <p className="text-xs text-[var(--color-muted)] -mt-1">{VERSION_HINT[version]}</p>

      <div className="flex flex-wrap gap-x-5 gap-y-2">
        <Toggle checked={upper} onChange={setUpper}>UPPERCASE</Toggle>
        <Toggle checked={hyphens} onChange={setHyphens}>Hyphens</Toggle>
        <Toggle checked={braces} onChange={setBraces}>{"{Braces}"}</Toggle>
      </div>

      <div className="grid gap-1.5 max-h-[420px] overflow-auto pr-1">
        {list.map((u, i) => (
          <button
            key={raw[i]}
            onClick={() => navigator.clipboard.writeText(u).then(() => flash(raw[i]))}
            className="group flex items-center gap-3 rounded-lg border border-[var(--color-border)] bg-black/20 px-3 py-2 text-left font-mono text-sm hover:border-zinc-500 hover:bg-white/5"
            title="Click to copy"
          >
            {list.length > 1 && <span className="w-7 shrink-0 text-right text-xs text-zinc-600">{i + 1}</span>}
            <span className="flex-1 break-all">{u}</span>
            <span className={`shrink-0 text-xs ${copied === raw[i] ? "text-[var(--color-accent)]" : "text-zinc-600 group-hover:text-zinc-400"}`}>{copied === raw[i] ? "Copied ✓" : "copy"}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function InspectSection() {
  const [input, setInput] = useState("");
  const info = useMemo(() => inspect(input), [input]);
  return (
    <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-3">
      <h2 className="font-semibold">Validate & inspect a UUID</h2>
      <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Paste a UUID to see its version, variant and timestamp" spellCheck={false} className={fieldCls + " w-full bg-black/30"} />
      {info.valid ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-[var(--color-muted)]">Valid</dt>
          <dd className="text-[var(--color-accent)]">✓ Yes</dd>
          {info.rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-[var(--color-muted)]">{k}</dt>
              <dd className="font-mono break-all">{v}</dd>
            </div>
          ))}
        </dl>
      ) : (
        info.reason && <p className="text-sm text-red-300">{info.reason}</p>
      )}
    </section>
  );
}

// ---------- hashing ----------

const ALGOS = [
  { name: "SHA-1", note: "legacy — not collision-safe" },
  { name: "SHA-256", note: "" },
  { name: "SHA-384", note: "" },
  { name: "SHA-512", note: "" },
] as const;
type Enc = "hex" | "HEX" | "base64";

async function digest(algo: string, data: Uint8Array, key: string): Promise<Uint8Array> {
  if (!key) return new Uint8Array(await crypto.subtle.digest(algo, data));
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: algo }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
}

function encode(bytes: Uint8Array, enc: Enc) {
  return enc === "base64" ? bytesToBase64(bytes) : bytesToHex(bytes, enc === "HEX");
}

/** Normalises a pasted hash to raw bytes (hex or base64) so comparisons ignore case and encoding. */
function toBytes(s: string): Uint8Array | null {
  const t = s.trim();
  if (!t) return null;
  if (/^[0-9a-f]+$/i.test(t) && t.length % 2 === 0) return Uint8Array.from(t.match(/../g)!, (h) => parseInt(h, 16));
  try {
    return base64ToBytes(t);
  } catch {
    return null;
  }
}

function sameBytes(a: Uint8Array, b: Uint8Array) {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

function HashSection() {
  const [source, setSource] = useState<"text" | "file">("text");
  const [text, setText] = useHashState("text", "hello veyth");
  const [file, setFile] = useState<{ name: string; size: number; bytes: Uint8Array } | null>(null);
  const [key, setKey] = useState("");
  const [enc, setEnc] = useState<Enc>("hex");
  const [expected, setExpected] = useState("");
  const [lastHashes, setHashes] = useState<Record<string, Uint8Array>>({});
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    const data = source === "file" ? file?.bytes : new TextEncoder().encode(text);
    if (!data) return;
    Promise.all(ALGOS.map(async (a) => [a.name, await digest(a.name, data, key)] as const)).then((pairs) => {
      if (!cancelled) setHashes(Object.fromEntries(pairs));
    });
    return () => { cancelled = true; };
  }, [source, text, file, key]);

  async function loadFile(f: File | undefined) {
    if (!f) return;
    setBusy(true);
    setFile({ name: f.name, size: f.size, bytes: new Uint8Array(await f.arrayBuffer()) });
    setBusy(false);
  }

  // Nothing to hash yet (File tab, no file) — hide results left over from the Text tab.
  const hashes = source === "file" && !file ? {} : lastHashes;
  const want = toBytes(expected);
  const match = want ? ALGOS.find((a) => hashes[a.name] && sameBytes(hashes[a.name], want))?.name : undefined;

  return (
    <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">SHA hash {key && <span className="text-[var(--color-accent)]">· HMAC</span>}</h2>
        {source === "text" && <ShareButton params={{ text }} />}
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-3 items-center">
        <Segmented label="Hash" options={[{ value: "text", label: "Text" }, { value: "file", label: "File" }]} value={source} onChange={setSource} />
        <Segmented label="Output" options={[{ value: "hex", label: "hex" }, { value: "HEX", label: "HEX" }, { value: "base64", label: "Base64" }]} value={enc} onChange={setEnc} />
      </div>

      {source === "text" ? (
        <Panel label="Text" meta={`${new Blob([text]).size} bytes UTF-8`} actions={<button className={btnSm} onClick={() => setText("")} disabled={!text}>Clear</button>}>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} spellCheck={false} className="w-full rounded-xl bg-black/30 border border-[var(--color-border)] p-3 font-mono text-sm focus:outline-none focus:border-zinc-500" placeholder="Type or paste anything…" />
        </Panel>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); loadFile(e.dataTransfer.files[0]); }}
          onClick={() => fileRef.current?.click()}
          className={`cursor-pointer rounded-xl border-2 border-dashed p-6 text-center text-sm transition ${dragging ? "border-[var(--color-accent)] bg-[var(--color-accent)]/5" : "border-[var(--color-border)] hover:border-zinc-500"}`}
        >
          <input ref={fileRef} type="file" hidden onChange={(e) => loadFile(e.target.files?.[0])} />
          {busy ? "Reading…" : file ? (
            <span><b className="font-mono">{file.name}</b> <span className="text-[var(--color-muted)]">· {formatBytes(file.size)} · click or drop to change</span></span>
          ) : (
            <span className="text-[var(--color-muted)]">Drop a file here or <u>choose one</u> — it's read locally, never uploaded.</span>
          )}
        </div>
      )}

      <details className="group text-sm" open={!!key}>
        <summary className="cursor-pointer text-[var(--color-muted)] hover:text-white list-none"><span className="inline-block transition group-open:rotate-90">▸</span> HMAC secret key (optional)</summary>
        <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="Leave empty for a plain hash" spellCheck={false} className={fieldCls + " mt-2 w-full bg-black/30"} />
      </details>

      <div className="space-y-1.5">
        {ALGOS.map((a) => {
          const h = hashes[a.name] ? encode(hashes[a.name], enc) : "";
          const hit = match === a.name;
          return (
            <div key={a.name} className={`flex items-start gap-3 rounded-lg border px-3 py-2 ${hit ? "border-[var(--color-accent)] bg-[var(--color-accent)]/5" : "border-[var(--color-border)] bg-black/20"}`}>
              <div className="w-24 shrink-0 pt-0.5">
                <div className="text-xs font-mono">{key ? "HMAC-" : ""}{a.name}</div>
                {a.note && <div className="text-[10px] leading-tight text-zinc-600">{a.note}</div>}
              </div>
              <code className="flex-1 break-all font-mono text-xs leading-5 pt-0.5">{h || <span className="text-zinc-600">—</span>}</code>
              {hit && <span className="shrink-0 text-xs text-[var(--color-accent)] pt-0.5">✓ match</span>}
              <CopyButton text={h} small />
            </div>
          );
        })}
      </div>

      <Panel label="Compare" meta="paste an expected hash (hex or Base64) to check it">
        <input value={expected} onChange={(e) => setExpected(e.target.value)} placeholder="e.g. a checksum from a download page" spellCheck={false} className={`${fieldCls} w-full bg-black/30 ${expected ? (match ? "!border-[var(--color-accent)]" : "!border-red-800") : ""}`} />
        {expected && (
          <p className={`text-sm ${match ? "text-[var(--color-accent)]" : "text-red-300"}`}>
            {match ? `✓ Matches the ${key ? "HMAC-" : ""}${match} hash.` : want ? "✗ Doesn't match any of the hashes above." : "✗ That isn't valid hex or Base64."}
          </p>
        )}
      </Panel>

      <p className="text-xs text-[var(--color-muted)]">Uses Web Crypto — no network request. MD5 isn't offered: browsers don't implement it because it's broken.</p>
    </section>
  );
}

export default function UuidTool() {
  const [tab, setTab] = useState<"uuid" | "hash">(() => (location.hash.includes("text=") ? "hash" : "uuid"));
  return (
    <div className="space-y-5">
      <ToolHeader />
      <Segmented options={[{ value: "uuid", label: "UUID" }, { value: "hash", label: "Hash (SHA / HMAC)" }]} value={tab} onChange={setTab} />
      {tab === "uuid" ? (
        <div className="space-y-5">
          <UuidSection />
          <InspectSection />
        </div>
      ) : (
        <HashSection />
      )}
    </div>
  );
}
