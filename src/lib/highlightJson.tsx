import type { ReactNode } from "react";

const JSON_TOKEN = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false)\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;

/** Syntax-coloured spans for already-valid JSON text (e.g. JSON.stringify output). */
export function highlightJson(text: string): ReactNode[] {
  // Colouring a multi-MB document costs more than it helps.
  if (text.length > 300_000) return [text];
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(JSON_TOKEN)) {
    const i = m.index!;
    if (i > last) out.push(text.slice(last, i));
    const cls = m[1] ? (m[2] ? "text-sky-300" : "text-[var(--color-accent)]") : m[3] ? "text-violet-300" : m[0] === "null" ? "text-zinc-500" : "text-orange-300";
    if (m[1] && m[2]) {
      out.push(<span key={i} className={cls}>{m[1]}</span>, m[2]);
    } else {
      out.push(<span key={i} className={cls}>{m[0]}</span>);
    }
    last = i + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
