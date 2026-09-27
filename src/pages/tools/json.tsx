import { useMemo, useRef, useState, type ReactNode } from "react";
import { useHashState } from "../../lib/share";
import { CopyButton, PasteButton, Panel, Segmented, ShareButton, Toggle, ToolHeader, VeyStatus, btnSm } from "../../components/ui";
import { highlightJson } from "../../lib/highlightJson";
import { formatBytes } from "../../lib/format";
import { useFlash } from "../../lib/useFlash";

const SAMPLE = '{\n  "name": "veyth",\n  "tools": ["json", "uuid", "regex"],\n  "private": true,\n  "stats": { "users": 1024, "tracking": null }\n}';

const INDENTS = [
  { value: "2", label: "2 spaces" },
  { value: "4", label: "4 spaces" },
  { value: "t", label: "Tab" },
  { value: "0", label: "Minified" },
];

type Ok = { ok: true; value: unknown; text: string };
type Err = { ok: false; message: string; pos: number | null; line: number; col: number; hint: string };

export default function JsonTool() {
  const [raw, setRaw] = useHashState("in", SAMPLE);
  const [indent, setIndent] = useHashState("i", "2");
  const [sort, setSort] = useHashState("s", "");
  const [view, setView] = useState<"text" | "tree">("text");
  const [fixMsg, flashFix] = useFlash(2500);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const result = useMemo<Ok | Err | null>(() => {
    if (!raw.trim()) return null;
    try {
      const parsed = JSON.parse(raw);
      const value = sort ? sortObject(parsed) : parsed;
      const space = indent === "t" ? "\t" : Number(indent);
      return { ok: true, value, text: JSON.stringify(value, null, space) };
    } catch (e) {
      return describeError(raw, (e as Error).message);
    }
  }, [raw, sort, indent]);

  const stats = useMemo(() => (result?.ok ? measure(result.value) : null), [result]);

  function jumpTo(pos: number) {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(pos, Math.min(pos + 1, raw.length));
    // Scroll the caret into view: approximate by line index.
    const line = raw.slice(0, pos).split("\n").length - 1;
    el.scrollTop = Math.max(0, line * 24 - el.clientHeight / 2);
  }

  function fix() {
    const repaired = repairJson(raw);
    try {
      JSON.parse(repaired);
      setRaw(repaired);
      flashFix("Fixed ✓");
    } catch {
      flashFix("Couldn't fix this one automatically");
    }
  }

  function loadFile(file: File | undefined) {
    if (file) file.text().then(setRaw);
  }

  function download() {
    if (!result?.ok) return;
    const url = URL.createObjectURL(new Blob([result.text], { type: "application/json" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "formatted.json" });
    a.click();
    URL.revokeObjectURL(url);
  }

  const inBytes = new Blob([raw]).size;

  return (
    <div className="space-y-4">
      <ToolHeader>
        <ShareButton params={{ in: raw, i: indent, s: sort }} />
      </ToolHeader>

      <div className="flex flex-wrap gap-x-5 gap-y-3 items-center">
        <Segmented label="Output" options={INDENTS} value={indent} onChange={setIndent} />
        <Toggle checked={!!sort} onChange={(v) => setSort(v ? "1" : "")} title="Sort object keys alphabetically, recursively">
          Sort keys A→Z
        </Toggle>
      </div>

      {!result ? (
        <VeyStatus mood="idle">Paste JSON, drop a .json file, or load the sample — nothing leaves your browser.</VeyStatus>
      ) : result.ok ? (
        <VeyStatus mood="happy">
          Valid JSON · {stats!.summary} · {formatBytes(inBytes)} → {formatBytes(new Blob([result.text]).size)}
        </VeyStatus>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <VeyStatus mood="oops">
            {result.pos !== null && <b>Line {result.line}, column {result.col}: </b>}
            {result.message}
          </VeyStatus>
          {result.pos !== null && <button className={btnSm} onClick={() => jumpTo(result.pos!)}>Jump to error</button>}
          <button className={btnSm} onClick={fix} title="Removes comments & trailing commas, quotes keys, converts single quotes and Python True/False/None">
            {fixMsg || "✨ Try to fix"}
          </button>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <Panel
          label="Input"
          meta={raw ? formatBytes(inBytes) : undefined}
          actions={
            <>
              <button className={btnSm} onClick={() => setRaw(SAMPLE)}>Sample</button>
              <PasteButton onPaste={setRaw} />
              <button className={btnSm} onClick={() => fileRef.current?.click()}>Open file…</button>
              <button className={btnSm} onClick={() => setRaw("")} disabled={!raw}>Clear</button>
              <input ref={fileRef} type="file" accept=".json,application/json,text/plain" hidden onChange={(e) => loadFile(e.target.files?.[0])} />
            </>
          }
        >
          <textarea
            ref={inputRef}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              if (e.dataTransfer.files.length) {
                e.preventDefault();
                loadFile(e.dataTransfer.files[0]);
              }
            }}
            spellCheck={false}
            placeholder='{"paste": "your JSON here"}'
            className={`w-full h-[460px] rounded-xl bg-[var(--color-surface)] border p-3 font-mono text-sm leading-6 focus:outline-none placeholder:text-zinc-600 ${result && !result.ok ? "border-red-900 focus:border-red-700" : "border-[var(--color-border)] focus:border-zinc-500"}`}
          />
        </Panel>

        <Panel
          label="Output"
          actions={
            <>
              <Segmented size="sm" options={[{ value: "text", label: "Text" }, { value: "tree", label: "Tree" }]} value={view} onChange={setView} />
              <button className={btnSm} onClick={() => result?.ok && setRaw(result.text)} disabled={!result?.ok || result.text === raw} title="Replace the input with this output">
                ← Use as input
              </button>
              <button className={btnSm} onClick={download} disabled={!result?.ok}>Download</button>
              <CopyButton text={result?.ok ? result.text : ""} small primary />
            </>
          }
        >
          <div className="w-full h-[460px] rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] p-3 overflow-auto">
            {!result ? (
              <p className="text-sm text-zinc-600">Formatted output appears here.</p>
            ) : !result.ok ? (
              <ErrorContext src={raw} err={result} />
            ) : view === "tree" ? (
              <Tree value={result.value} />
            ) : (
              <pre className={`font-mono text-sm leading-6 ${indent === "0" ? "whitespace-pre-wrap break-all" : "whitespace-pre"}`}>{highlightJson(result.text)}</pre>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}

// ---------- errors ----------

function lineCol(src: string, pos: number) {
  const before = src.slice(0, pos).split("\n");
  return { line: before.length, col: before[before.length - 1].length + 1 };
}

/** Normalises the different engines' messages into { message, position, hint }. */
function describeError(src: string, raw: string): Err {
  let pos: number | null = null;
  const lc = raw.match(/line (\d+) column (\d+)/);
  const p = raw.match(/position (\d+)/);
  if (p) pos = Number(p[1]);
  else if (lc) {
    const lines = src.split("\n");
    pos = lines.slice(0, Number(lc[1]) - 1).reduce((n, l) => n + l.length + 1, 0) + Number(lc[2]) - 1;
  } else if (/end of (JSON )?(input|data)/i.test(raw)) pos = src.trimEnd().length;

  const message = raw
    .replace(/^JSON\.parse: /, "")
    .replace(/^JSON Parse error: /, "")
    .replace(/,? ?"[^"]*"\s*is not valid JSON$/, "")
    .replace(/ (in JSON )?at position \d+( \(line \d+ column \d+\))?/, "")
    .replace(/ at line \d+ column \d+ of the JSON data/, "");

  const at = pos ?? 0;
  const ch = src[at] ?? "";
  const prev = src.slice(0, at).trimEnd().slice(-1);
  let hint = "";
  if (/,\s*[}\]]/.test(src.slice(Math.max(0, at - 20), at + 2))) hint = "Trailing commas aren't allowed in JSON — remove the comma before the closing bracket.";
  else if (ch === "'") hint = "JSON strings need double quotes (\"like this\"), not single quotes.";
  else if (ch === "/") hint = "JSON doesn't allow comments.";
  else if (/[A-Za-z_$]/.test(ch) && (prev === "{" || prev === ",")) hint = "Object keys must be wrapped in double quotes.";
  else if (/^(True|False|None|undefined|NaN)/.test(src.slice(at))) hint = "Use true, false or null — JSON has no True/False/None/undefined/NaN.";
  else if (prev === '"') hint = "Probably a missing comma between values, or a missing colon after a key.";
  else if (prev === "}" || prev === "]" || /\d/.test(prev)) hint = "Looks like a missing comma between two values.";
  else if (pos !== null && pos >= src.trimEnd().length) hint = "The document ends early — a closing bracket, brace or quote is probably missing.";

  return { ok: false, message, pos, ...(pos !== null ? lineCol(src, pos) : { line: 0, col: 0 }), hint };
}

function ErrorContext({ src, err }: { src: string; err: Err }) {
  const lines = src.split("\n");
  const from = Math.max(0, err.line - 3);
  const width = String(err.line).length;
  return (
    <div className="space-y-4 text-sm">
      {err.pos !== null && (
        <pre className="font-mono text-xs leading-6 overflow-x-auto">
          {lines.slice(from, err.line).map((l, i) => {
            const n = from + i + 1;
            return (
              <div key={n} className={n === err.line ? "text-red-200" : "text-zinc-500"}>
                <span className="select-none text-zinc-600">{String(n).padStart(width)} │ </span>
                {l || " "}
              </div>
            );
          })}
          <div className="text-red-400">
            <span className="select-none text-zinc-600">{" ".repeat(width)} │ </span>
            {" ".repeat(Math.max(0, err.col - 1))}^ here
          </div>
        </pre>
      )}
      {err.hint && <p className="text-[var(--color-muted)]"><span className="text-[var(--color-accent)]">Hint:</span> {err.hint}</p>}
      <p className="text-xs text-zinc-600">"Try to fix" handles comments, trailing commas, single quotes, unquoted keys and Python-style values.</p>
    </div>
  );
}

// ---------- repair ----------

/** Best-effort conversion of JS-object / JSON5-ish / Python-dict text into strict JSON. */
function repairJson(src: string): string {
  let out = "";
  let i = 0;
  const n = src.length;
  const dropTrailingComma = () => {
    const t = out.trimEnd();
    if (t.endsWith(",")) out = t.slice(0, -1);
  };
  while (i < n) {
    const c = src[i];
    if (c === '"') {
      let j = i + 1;
      while (j < n && src[j] !== '"') j += src[j] === "\\" ? 2 : 1;
      out += src.slice(i, j + 1);
      i = j + 1;
    } else if (c === "'") {
      let j = i + 1;
      let s = "";
      while (j < n && src[j] !== "'") {
        if (src[j] === "\\" && src[j + 1] === "'") { s += "'"; j += 2; continue; }
        if (src[j] === "\\") { s += src.slice(j, j + 2); j += 2; continue; }
        s += src[j] === '"' ? '\\"' : src[j];
        j++;
      }
      out += `"${s}"`;
      i = j + 1;
    } else if (c === "/" && src[i + 1] === "/") {
      while (i < n && src[i] !== "\n") i++;
    } else if (c === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      i = end === -1 ? n : end + 2;
    } else if (c === "}" || c === "]") {
      dropTrailingComma();
      out += c;
      i++;
    } else if (/[A-Za-z_$]/.test(c)) {
      let j = i;
      while (j < n && /[\w$]/.test(src[j])) j++;
      const word = src.slice(i, j);
      const isKey = /^\s*:/.test(src.slice(j));
      const py: Record<string, string> = { True: "true", False: "false", None: "null", undefined: "null", NaN: "null" };
      out += isKey ? `"${word}"` : (py[word] ?? word);
      i = j;
    } else {
      out += c;
      i++;
    }
  }
  dropTrailingComma();
  return out;
}

// ---------- tree ----------

function Tree({ value }: { value: unknown }) {
  const [depth, setDepth] = useState(2);
  const [gen, setGen] = useState(0);
  const set = (d: number) => { setDepth(d); setGen((g) => g + 1); };
  return (
    <div className="space-y-2">
      <div className="flex gap-1.5">
        <button className={btnSm} onClick={() => set(Infinity)}>Expand all</button>
        <button className={btnSm} onClick={() => set(1)}>Collapse all</button>
        <span className="self-center text-xs text-zinc-600">Click a value to copy its path</span>
      </div>
      <div key={gen} className="font-mono text-sm leading-6">
        <TreeNode name={null} value={value} path="$" depth={0} openDepth={depth} />
      </div>
    </div>
  );
}

function childPath(parent: string, key: string | number) {
  return typeof key === "number" ? `${parent}[${key}]` : /^[A-Za-z_$][\w$]*$/.test(key) ? `${parent}.${key}` : `${parent}[${JSON.stringify(key)}]`;
}

function TreeNode({ name, value, path, depth, openDepth }: { name: ReactNode; value: unknown; path: string; depth: number; openDepth: number }) {
  const [msg, flash] = useFlash(1200);
  const label = name !== null && <span className="text-sky-300">{name}<span className="text-zinc-500">: </span></span>;
  const copyPath = () => navigator.clipboard.writeText(path).then(() => flash(`copied ${path}`), () => {});

  if (value !== null && typeof value === "object") {
    const entries: [string | number, unknown][] = Array.isArray(value) ? value.map((v, i) => [i, v]) : Object.entries(value);
    const [open, close] = Array.isArray(value) ? ["[", "]"] : ["{", "}"];
    const count = Array.isArray(value) ? `${entries.length} item${entries.length === 1 ? "" : "s"}` : `${entries.length} key${entries.length === 1 ? "" : "s"}`;
    if (!entries.length) return <div>{label}<span className="text-zinc-500">{open}{close}</span></div>;
    return (
      <details open={depth < openDepth} className="group">
        <summary className="cursor-pointer list-none hover:bg-white/5 rounded -ml-1 pl-1">
          <span className="inline-block w-3 text-zinc-500 transition group-open:rotate-90">▸</span>
          {label}
          <span className="text-zinc-500">{open}</span>
          <span className="text-zinc-600 text-xs group-open:hidden"> {count} {close}</span>
        </summary>
        <div className="ml-1.5 pl-3 border-l border-[var(--color-border)]">
          {entries.map(([k, v]) => (
            <TreeNode key={k} name={typeof k === "number" ? <span className="text-zinc-500">{k}</span> : `"${k}"`} value={v} path={childPath(path, k)} depth={depth + 1} openDepth={openDepth} />
          ))}
        </div>
        <div className="pl-3 text-zinc-500">{close}</div>
      </details>
    );
  }

  const cls = typeof value === "string" ? "text-[var(--color-accent)]" : typeof value === "boolean" ? "text-violet-300" : value === null ? "text-zinc-500" : "text-orange-300";
  return (
    <div className="pl-3 hover:bg-white/5 rounded cursor-pointer break-all" onClick={copyPath} title={path}>
      {label}
      <span className={cls}>{JSON.stringify(value)}</span>
      {msg && <span className="ml-2 text-xs text-zinc-500">{msg}</span>}
    </div>
  );
}

// ---------- helpers ----------

function measure(value: unknown) {
  let keys = 0;
  let depth = 0;
  const walk = (v: unknown, d: number) => {
    depth = Math.max(depth, d);
    if (Array.isArray(v)) v.forEach((x) => walk(x, d + 1));
    else if (v !== null && typeof v === "object") {
      for (const [, x] of Object.entries(v)) { keys++; walk(x, d + 1); }
    }
  };
  walk(value, 0);
  const type = Array.isArray(value) ? `array of ${value.length}` : value === null ? "null" : typeof value;
  return { summary: `${type}${keys ? ` · ${keys} keys` : ""}${depth ? ` · depth ${depth}` : ""}` };
}

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObject);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) out[k] = sortObject((value as Record<string, unknown>)[k]);
    return out;
  }
  return value;
}
