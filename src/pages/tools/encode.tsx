import { useMemo } from "react";
import { useHashState } from "../../lib/share";
import { base64Decode, base64Encode, bytesToHex, hexDecode } from "../../lib/codec";
import { CopyButton, PasteButton, Panel, Segmented, ShareButton, Toggle, ToolHeader, VeyStatus, btnSm } from "../../components/ui";
import { formatBytes } from "../../lib/format";

type Format = {
  label: string;
  /** What the encoded side is called in pane labels. */
  noun: string;
  enc: (s: string, plus: boolean) => string;
  dec: (s: string, plus: boolean) => string;
  /** Cheap check used to suggest decoding when someone pastes already-encoded text. */
  looksLike: (s: string) => boolean;
};

const B64_CHARS = /[^A-Za-z0-9+/=\s_-]/;

function decodeB64(s: string) {
  const bad = s.search(B64_CHARS);
  if (bad >= 0) throw new Error(`"${s[bad]}" at position ${bad + 1} isn't a Base64 character`);
  try {
    return base64Decode(s);
  } catch (e) {
    if ((e as Error).message.includes("length")) throw new Error("Length is off — Base64 comes in groups of 4 characters; some may be missing");
    throw new Error("Decodes to binary data, not readable UTF-8 text");
  }
}

function decodeUrl(s: string, plus: boolean) {
  try {
    return decodeURIComponent(plus ? s.replace(/\+/g, " ") : s);
  } catch {
    const bad = s.search(/%(?![0-9a-f]{2})/i);
    throw new Error(bad >= 0 ? `Broken % escape at position ${bad + 1} — "%" must be followed by two hex digits` : "The % escapes don't form valid UTF-8 text");
  }
}

const HTML_ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

const FORMATS: Record<string, Format> = {
  base64: {
    label: "Base64",
    noun: "Base64",
    enc: (s) => base64Encode(s),
    dec: decodeB64,
    looksLike: (s) => /^[A-Za-z0-9+/]+={0,2}$/.test(s.replace(/\s/g, "")) && s.replace(/\s/g, "").length % 4 === 0 && s.length >= 8,
  },
  base64url: {
    label: "Base64URL",
    noun: "Base64URL",
    enc: (s) => base64Encode(s, true),
    dec: decodeB64,
    looksLike: (s) => /^[A-Za-z0-9_-]{8,}$/.test(s.trim()) && /[-_]/.test(s),
  },
  url: {
    label: "URL",
    noun: "URL-encoded",
    enc: (s, plus) => (plus ? encodeURIComponent(s).replace(/%20/g, "+") : encodeURIComponent(s)),
    dec: decodeUrl,
    looksLike: (s) => /%[0-9a-f]{2}/i.test(s),
  },
  hex: {
    label: "Hex",
    noun: "Hex",
    enc: (s) => bytesToHex(new TextEncoder().encode(s)),
    dec: hexDecode,
    looksLike: (s) => /^(?:0x)?(?:[0-9a-f]{2}[\s:-]?){3,}$/i.test(s.trim()),
  },
  html: {
    label: "HTML entities",
    noun: "HTML-escaped",
    enc: (s) => s.replace(/[&<>"']/g, (c) => HTML_ESC[c]),
    // DOMParser never runs scripts or loads resources — it only resolves the entities.
    dec: (s) => new DOMParser().parseFromString(`<!doctype html><body>${s.replace(/</g, "&lt;")}`, "text/html").body.textContent ?? "",
    looksLike: (s) => /&(?:#\d+|#x[0-9a-f]+|[a-z]+);/i.test(s),
  },
};
type Mode = keyof typeof FORMATS;
const ORDER: Mode[] = ["base64", "base64url", "url", "hex", "html"];

function printable(s: string) {
  // Mostly-visible text; rejects the gibberish you get from decoding a random word as Base64.
  // eslint-disable-next-line no-control-regex -- counting control characters is the point
  const bad = s.match(/[\u0000-\u0008\u000e-\u001f�]/g)?.length ?? 0;
  return s.length > 0 && bad / s.length < 0.02;
}

/** First format (preferring `prefer`) that plausibly encoded `s` and decodes cleanly. */
function detect(s: string, prefer: Mode): Mode | null {
  if (!s.trim()) return null;
  for (const k of [prefer, ...ORDER.filter((m) => m !== prefer)]) {
    const f = FORMATS[k];
    if (!f.looksLike(s)) continue;
    try {
      const out = f.dec(s, false);
      if (out !== s && printable(out)) return k;
    } catch {
      /* not this one */
    }
  }
  return null;
}

export default function EncodeTool() {
  const [mode, setMode] = useHashState("m", "base64");
  const [dir, setDir] = useHashState("d", "enc");
  const [input, setInput] = useHashState("in", "Hello, veyth! Ünïcødé works too ✓");
  const [plus, setPlus] = useHashState("plus", "");

  const key = (mode in FORMATS ? mode : "base64") as Mode;
  const f = FORMATS[key];
  const decoding = dir === "dec";

  const result = useMemo(() => {
    if (!input) return { ok: true, text: "", error: "" };
    try {
      return { ok: true, text: decoding ? f.dec(input, !!plus) : f.enc(input, !!plus), error: "" };
    } catch (e) {
      return { ok: false, text: "", error: (e as Error).message };
    }
  }, [f, decoding, input, plus]);

  // Nudge: pasted encoded text into "Encode", or text in the wrong format into "Decode".
  const suggestion = useMemo(() => {
    if (!input || input.length > 100_000) return null;
    if (!decoding) {
      const d = detect(input, key);
      return d ? { mode: d, dir: "dec", text: `This already looks like ${FORMATS[d].noun} text.`, action: `Decode as ${FORMATS[d].label}` } : null;
    }
    if (!result.ok) {
      const d = detect(input, key);
      return d && d !== key ? { mode: d, dir: "dec", text: `This looks like ${FORMATS[d].noun} rather than ${f.label}.`, action: `Switch to ${FORMATS[d].label}` } : null;
    }
    return null;
  }, [input, decoding, key, f, result.ok]);

  function swap() {
    if (!result.ok) return;
    setInput(result.text);
    setDir(decoding ? "enc" : "dec");
  }

  const plain = "Plain text";
  const inLabel = decoding ? f.noun : plain;
  const outLabel = decoding ? plain : f.noun;
  const bytes = (s: string) => formatBytes(new Blob([s]).size);

  return (
    <div className="space-y-4">
      <ToolHeader>
        <ShareButton params={{ m: key, d: dir, in: input, ...(plus ? { plus } : {}) }} />
      </ToolHeader>

      <div className="flex flex-wrap gap-x-5 gap-y-3 items-center">
        <Segmented label="Format" options={ORDER.map((k) => ({ value: k, label: FORMATS[k].label }))} value={key} onChange={setMode} />
        <Segmented
          label="Direction"
          options={[
            { value: "enc", label: "Encode", title: `${plain} → ${f.noun}` },
            { value: "dec", label: "Decode", title: `${f.noun} → ${plain}` },
          ]}
          value={decoding ? "dec" : "enc"}
          onChange={setDir}
        />
        {key === "url" && (
          <Toggle checked={!!plus} onChange={(v) => setPlus(v ? "1" : "")} title="HTML form / query-string style: space ⇄ +">
            Spaces as +
          </Toggle>
        )}
      </div>

      {suggestion ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/5 px-3 py-2 text-sm">
          <span>💡 {suggestion.text}</span>
          <button
            className="rounded-full bg-[var(--color-accent)] px-3 py-1 text-xs font-medium text-black"
            onClick={() => { setMode(suggestion.mode); setDir(suggestion.dir); }}
          >
            {suggestion.action}
          </button>
        </div>
      ) : !input ? (
        <VeyStatus mood="idle">Type or paste {decoding ? `${f.noun} text to decode` : "text to encode"} — it converts as you type.</VeyStatus>
      ) : result.ok ? (
        <VeyStatus mood="happy">{decoding ? "Decoded" : "Encoded"} · {input.length} → {result.text.length} chars · {bytes(result.text)}</VeyStatus>
      ) : (
        <VeyStatus mood="oops">Can't decode: {result.error}.</VeyStatus>
      )}

      <div className="grid md:grid-cols-[1fr_auto_1fr] gap-4 md:gap-2 items-stretch">
        <Panel
          label="Input"
          meta={inLabel}
          actions={
            <>
              <PasteButton onPaste={setInput} />
              <button className={btnSm} onClick={() => setInput("")} disabled={!input}>Clear</button>
            </>
          }
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            spellCheck={false}
            placeholder={decoding ? `Paste ${f.noun} text…` : "Type or paste text…"}
            className={`w-full h-[320px] rounded-xl bg-[var(--color-surface)] border p-3 font-mono text-sm leading-6 focus:outline-none placeholder:text-zinc-600 ${result.ok ? "border-[var(--color-border)] focus:border-zinc-500" : "border-red-900 focus:border-red-700"}`}
          />
        </Panel>

        <div className="flex md:flex-col items-center justify-center md:pt-9">
          <button
            onClick={swap}
            disabled={!result.ok || !result.text}
            title="Swap: move the output into the input and flip direction"
            aria-label="Swap input and output"
            className="h-10 w-10 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)] text-lg hover:border-zinc-500 hover:bg-zinc-800 disabled:opacity-40 disabled:pointer-events-none transition rotate-90 md:rotate-0"
          >
            ⇄
          </button>
        </div>

        <Panel label="Output" meta={outLabel} actions={<CopyButton text={result.ok ? result.text : ""} small primary />}>
          <pre className="w-full h-[320px] rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] p-3 font-mono text-sm leading-6 overflow-auto whitespace-pre-wrap break-all">
            {result.ok ? result.text || <span className="text-zinc-600">Result appears here.</span> : <span className="text-red-300">{result.error}</span>}
          </pre>
        </Panel>
      </div>
    </div>
  );
}
