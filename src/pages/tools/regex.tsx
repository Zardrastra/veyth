import { useMemo, useRef, useState, type ReactNode } from "react";
import { useHashState } from "../../lib/share";
import { REPO_URL } from "../../lib/env";
import { CopyButton, Panel, ShareButton, ToolHeader, VeyStatus, btnSm, fieldCls } from "../../components/ui";
import { HighlightTextarea } from "../../components/code";
import PATTERNS from "../../data/regex-patterns.json";

const FLAGS = [
  { f: "g", name: "global", desc: "Find every match, not just the first" },
  { f: "i", name: "ignore case", desc: "a matches A" },
  { f: "m", name: "multiline", desc: "^ and $ match at each line break" },
  { f: "s", name: "dot all", desc: ". also matches newlines" },
  { f: "u", name: "unicode", desc: "Full Unicode, enables \\p{…} classes" },
  { f: "y", name: "sticky", desc: "Only match starting exactly at lastIndex" },
];
const FLAG_ORDER = "dgimsuvy";

// "…" marks where the caret lands after inserting.
const CHEATSHEET: [string, [string, string][]][] = [
  ["Characters", [[".", "any char"], ["\\d", "digit"], ["\\w", "word char"], ["\\s", "whitespace"], ["\\D", "non-digit"], ["[abc]", "one of"], ["[^abc]", "none of"], ["[a-z]", "range"]]],
  ["Anchors", [["^", "start"], ["$", "end"], ["\\b", "word boundary"], ["\\B", "not boundary"]]],
  ["Quantifiers", [["*", "0 or more"], ["+", "1 or more"], ["?", "optional"], ["{…}", "exactly n"], ["{2,5}", "2 to 5"], ["+?", "lazy"]]],
  ["Groups", [["(…)", "capture"], ["(?:…)", "group only"], ["(?<name>…)", "named"], ["|", "or"], ["\\1", "backreference"]]],
  ["Lookaround", [["(?=…)", "followed by"], ["(?!…)", "not followed by"], ["(?<=…)", "preceded by"], ["(?<!…)", "not preceded by"]]],
];

const MAX_MATCHES = 1000;

export default function RegexTool() {
  const [pattern, setPattern] = useHashState("p", "(\\w+)@(\\w+\\.\\w+)");
  const [flags, setFlags] = useHashState("f", "g");
  const [text, setText] = useHashState("t", "Contact us at hello@veyth.eu or support@veyth.eu — not at @invalid");
  const [replaceWith, setReplaceWith] = useHashState("r", "$1 [at] $2");
  const [hover, setHover] = useState<number | null>(null);
  const [showCheats, setShowCheats] = useState(false);
  const patternRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const global = flags.includes("g");

  const result = useMemo(() => {
    if (!pattern) return { ok: true as const, empty: true, all: [] as RegExpMatchArray[], names: [] as (string | null)[], capped: false };
    try {
      const all: RegExpMatchArray[] = [];
      let capped = false;
      for (const m of text.matchAll(new RegExp(pattern, global ? flags : flags + "g"))) {
        if (all.length >= MAX_MATCHES) { capped = true; break; }
        all.push(m);
      }
      return { ok: true as const, empty: false, all, names: groupNames(pattern), capped };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message.replace(/^Invalid regular expression: /, "") };
    }
  }, [pattern, flags, global, text]);

  // Without g, JS only ever uses the first match — show exactly that.
  const matches = useMemo(() => (result.ok ? (global ? result.all : result.all.slice(0, 1)) : []), [result, global]);

  const replaced = useMemo(() => {
    const parts: ReactNode[] = [];
    let plain = "";
    let last = 0;
    matches.forEach((m, i) => {
      const r = expand(replaceWith, m, text);
      parts.push(text.slice(last, m.index), <mark key={i} className="bg-sky-400/25 text-inherit rounded-sm">{r}</mark>);
      plain += text.slice(last, m.index) + r;
      last = m.index! + m[0].length;
    });
    parts.push(text.slice(last));
    plain += text.slice(last);
    return { parts, plain };
  }, [matches, replaceWith, text]);

  function toggleFlag(f: string) {
    setFlags((prev) => (prev.includes(f) ? prev.replace(f, "") : [...prev + f].sort((a, b) => FLAG_ORDER.indexOf(a) - FLAG_ORDER.indexOf(b)).join("")));
  }

  function loadPattern(name: string) {
    const p = PATTERNS.find((x) => x.name === name);
    if (!p) return;
    setPattern(p.pattern);
    setFlags(p.flags);
    setText(p.sample);
  }

  function insert(token: string) {
    const el = patternRef.current;
    const caret = token.indexOf("…");
    const clean = token.replace("…", "");
    const start = el?.selectionStart ?? pattern.length;
    const end = el?.selectionEnd ?? pattern.length;
    // Wrap the current selection when the token has a slot, e.g. select "abc" → (?:abc)
    const selected = pattern.slice(start, end);
    const ins = caret >= 0 && selected ? clean.slice(0, caret) + selected + clean.slice(caret) : clean;
    setPattern(pattern.slice(0, start) + ins + pattern.slice(end));
    const pos = start + (caret >= 0 ? caret + selected.length : ins.length);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  }

  function selectMatch(m: RegExpMatchArray) {
    const el = textRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(m.index!, m.index! + m[0].length);
  }

  const highlight = useMemo(() => {
    const out: ReactNode[] = [];
    let last = 0;
    matches.forEach((m, i) => {
      if (!m[0].length) return;
      out.push(text.slice(last, m.index));
      const tone = i % 2 ? "bg-sky-400/30" : "bg-[var(--color-accent)]/30";
      const ring = hover === i ? " shadow-[0_0_0_1px_#fff]" : "";
      out.push(<mark key={i} className={`${tone}${ring} text-inherit rounded-sm`}>{m[0]}</mark>);
      last = m.index! + m[0].length;
    });
    out.push(text.slice(last));
    return out;
  }, [matches, text, hover]);

  const groupCount = result.ok ? result.names.length : 0;

  return (
    <div className="space-y-4">
      <ToolHeader>
        <ShareButton params={{ p: pattern, f: flags, t: text, r: replaceWith }} />
      </ToolHeader>

      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-mono text-[var(--color-muted)] uppercase tracking-wide">Pattern</div>
          <div className="flex flex-wrap items-center gap-1.5">
            <select value="" onChange={(e) => loadPattern(e.target.value)} className={btnSm + " pr-2 cursor-pointer"} aria-label="Load a common pattern">
              <option value="" disabled>Load a common pattern…</option>
              {PATTERNS.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
            </select>
            {REPO_URL && (
              <a href={`${REPO_URL}/blob/main/src/data/regex-patterns.json`} target="_blank" rel="noopener" className="text-xs text-zinc-500 hover:text-white px-1">+ add yours</a>
            )}
            <button className={btnSm + (showCheats ? " !text-white !border-zinc-500" : "")} onClick={() => setShowCheats((v) => !v)} aria-expanded={showCheats}>
              {showCheats ? "Hide" : "Show"} cheat sheet
            </button>
          </div>
        </div>

        <div className={`flex items-center rounded-lg border bg-black/30 font-mono text-sm focus-within:border-zinc-500 ${result.ok ? "border-[var(--color-border)]" : "border-red-800"}`}>
          <span className="pl-3 text-zinc-500 select-none">/</span>
          <input
            ref={patternRef}
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            placeholder="type a pattern, e.g. \d+"
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            className="flex-1 min-w-0 bg-transparent px-1 py-2.5 focus:outline-none placeholder:text-zinc-600"
          />
          <span className="pr-3 text-zinc-500 select-none">/<span className="text-[var(--color-accent)]">{flags}</span></span>
        </div>

        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Flags">
          {FLAGS.map(({ f, name, desc }) => {
            const on = flags.includes(f);
            return (
              <button
                key={f}
                onClick={() => toggleFlag(f)}
                aria-pressed={on}
                title={desc}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${on ? "bg-[var(--color-accent)] text-black border-[var(--color-accent)]" : "bg-[var(--color-surface-2)] border-[var(--color-border)] text-[var(--color-muted)] hover:text-white"}`}
              >
                <b className="font-mono">{f}</b>
                <span>{name}</span>
              </button>
            );
          })}
        </div>

        {showCheats && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 border-t border-[var(--color-border)] pt-3">
            {CHEATSHEET.map(([title, items]) => (
              <div key={title} className="space-y-1">
                <div className="text-xs text-zinc-500">{title}</div>
                {items.map(([tok, label]) => (
                  <button key={tok} onClick={() => insert(tok)} className="flex w-full items-baseline gap-2 rounded px-1.5 py-0.5 text-left text-xs hover:bg-white/5" title="Insert into pattern">
                    <code className="font-mono text-[var(--color-accent)] shrink-0">{tok.replace("…", "")}</code>
                    <span className="text-[var(--color-muted)] truncate">{label}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {!result.ok ? (
        <VeyStatus mood="oops"><span className="font-mono">{result.error}</span></VeyStatus>
      ) : result.empty ? (
        <VeyStatus mood="idle">Type a pattern — matches light up in the test string as you go.</VeyStatus>
      ) : !matches.length ? (
        <VeyStatus mood="idle">No matches{flags.includes("i") ? "" : " — case matters; try the i flag"}.</VeyStatus>
      ) : (
        <VeyStatus mood="happy">
          {global ? `${result.all.length}${result.capped ? "+" : ""} match${result.all.length === 1 ? "" : "es"}` : `First match only — turn on g to find all ${result.all.length}`}
          {groupCount ? ` · ${groupCount} capture group${groupCount === 1 ? "" : "s"}` : ""}
        </VeyStatus>
      )}

      <Panel
        label="Test string"
        meta={`${text.length} chars`}
        actions={<button className={btnSm} onClick={() => setText("")} disabled={!text}>Clear</button>}
      >
        <HighlightTextarea
          ref={textRef}
          value={text}
          onChange={setText}
          highlight={highlight}
          placeholder="Paste the text to search here"
          className="h-[200px]"
        />
      </Panel>

      <div className="grid md:grid-cols-2 gap-4">
        <Panel label="Matches" meta={matches.length ? String(matches.length) : undefined}>
          <div className="h-[260px] overflow-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2 space-y-1.5" onMouseLeave={() => setHover(null)}>
            {!matches.length ? (
              <p className="p-1 text-sm text-zinc-600">Matches and their capture groups are listed here.</p>
            ) : (
              matches.slice(0, 200).map((m, i) => (
                <button
                  key={i}
                  onMouseEnter={() => setHover(i)}
                  onClick={() => selectMatch(m)}
                  className={`block w-full text-left rounded-lg border p-2 font-mono text-xs transition ${hover === i ? "border-zinc-500 bg-white/5" : "border-[var(--color-border)] bg-black/20"}`}
                  title="Select in test string"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="text-zinc-500 w-6 shrink-0">{i + 1}</span>
                    <b className={`break-all ${i % 2 ? "text-sky-300" : "text-[var(--color-accent)]"}`}>{m[0] || <i className="text-zinc-500 font-normal">empty</i>}</b>
                    <span className="ml-auto shrink-0 text-zinc-600">{m.index}–{m.index! + m[0].length}</span>
                  </div>
                  {m.length > 1 && (
                    <div className="mt-1 ml-8 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
                      {m.slice(1).map((g, gi) => (
                        <div key={gi} className="contents">
                          <span className="text-zinc-500">{result.ok && result.names[gi] ? `${result.names[gi]}` : `$${gi + 1}`}</span>
                          <span className="break-all text-zinc-300">{g ?? <i className="text-zinc-600">not matched</i>}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </button>
              ))
            )}
            {matches.length > 200 && <p className="p-1 text-xs text-zinc-500">Showing the first 200.</p>}
          </div>
        </Panel>

        <Panel label="Replace" actions={<CopyButton text={matches.length ? replaced.plain : ""} label="Copy result" small />}>
          <input
            value={replaceWith}
            onChange={(e) => setReplaceWith(e.target.value)}
            placeholder="Replacement text"
            spellCheck={false}
            className={fieldCls + " w-full"}
          />
          <p className="text-xs text-zinc-500">
            <code className="text-zinc-300">$1</code> group · <code className="text-zinc-300">$&lt;name&gt;</code> named group · <code className="text-zinc-300">$&amp;</code> whole match · <code className="text-zinc-300">$$</code> literal $
            {!global && matches.length > 0 && <> · <span className="text-zinc-400">without g only the first match is replaced</span></>}
          </p>
          <pre className="h-[185px] overflow-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 font-mono text-sm leading-6 whitespace-pre-wrap break-words">
            {result.ok ? replaced.parts : "—"}
          </pre>
        </Panel>
      </div>
    </div>
  );
}

/** Names of capture groups in order (null = unnamed), skipping escapes, classes and non-capturing groups. */
function groupNames(src: string): (string | null)[] {
  const out: (string | null)[] = [];
  let inClass = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === "\\") { i++; continue; }
    if (inClass) { if (c === "]") inClass = false; continue; }
    if (c === "[") { inClass = true; continue; }
    if (c !== "(") continue;
    if (src[i + 1] !== "?") out.push(null);
    else {
      const named = src.slice(i).match(/^\(\?<([A-Za-z_$][\w$]*)>/);
      if (named) out.push(named[1]);
    }
  }
  return out;
}

/** Same substitution rules as String.prototype.replace, applied to one match. */
function expand(tpl: string, m: RegExpMatchArray, input: string): string {
  return tpl.replace(/\$(\$|&|`|'|\d{1,2}|<([^>]*)>)/g, (all, tok: string, name?: string) => {
    if (tok === "$") return "$";
    if (tok === "&") return m[0];
    if (tok === "`") return input.slice(0, m.index);
    if (tok === "'") return input.slice(m.index! + m[0].length);
    if (name !== undefined) return m.groups ? (m.groups[name] ?? "") : all;
    const n = Number(tok);
    if (n >= 1 && n < m.length) return m[n] ?? "";
    if (tok.length === 2) {
      const d = Number(tok[0]);
      if (d >= 1 && d < m.length) return (m[d] ?? "") + tok[1];
    }
    return all;
  });
}
