import { type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { findTool } from "../tools";
import { REPO_URL } from "../lib/env";
import { MAX_SHARE_LENGTH, hashFor, shareUrl } from "../lib/share";
import { useFlash } from "../lib/useFlash";
import { Mascot, type Mood } from "./Mascot";

export const btn =
  "px-3 py-1.5 rounded-full bg-[var(--color-surface-2)] border border-[var(--color-border)] text-sm hover:bg-zinc-800 disabled:opacity-40 disabled:pointer-events-none transition";
export const btnSm =
  "px-2.5 py-1 rounded-full bg-[var(--color-surface-2)] border border-[var(--color-border)] text-xs text-[var(--color-muted)] hover:text-white hover:bg-zinc-800 disabled:opacity-40 disabled:pointer-events-none transition";
export const fieldCls =
  "bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 font-mono text-sm focus:outline-none focus:border-zinc-500";


export function CopyButton({ text, label = "Copy", primary = false, small = false, disabled = false }: { text: string; label?: string; primary?: boolean; small?: boolean; disabled?: boolean }) {
  const [msg, flash] = useFlash();
  return (
    <button
      onClick={() => navigator.clipboard.writeText(text).then(() => flash("Copied ✓"), () => flash("Copy failed"))}
      disabled={disabled || !text}
      className={primary
        ? `${small ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm"} rounded-full bg-[var(--color-accent)] text-black font-medium disabled:opacity-40 disabled:pointer-events-none`
        : small ? btnSm : btn}
    >
      {msg || label}
    </button>
  );
}

/** Copies a link that restores this tool's state from the URL fragment. */
export function ShareButton({ params }: { params: Record<string, string> }) {
  const [msg, flash] = useFlash(2000);
  function share() {
    const url = shareUrl(params);
    if (url.length > MAX_SHARE_LENGTH) return flash("Too large to share as a link");
    history.replaceState(history.state, "", hashFor(params));
    navigator.clipboard.writeText(url).then(() => flash("Link copied ✓"), () => flash("Copy failed"));
  }
  return (
    <button
      onClick={share}
      title="Copy a link that reopens this exact input. The data lives after the # and is never sent to the server."
      className="px-3 py-1.5 rounded-full bg-[var(--color-surface-2)] border border-[var(--color-border)] text-sm hover:bg-zinc-800"
    >
      {msg || "🔗 Share link"}
    </button>
  );
}

/** Page heading for a tool: title, description, contributor credit, optional right-side actions. */
export function ToolHeader({ children }: { children?: ReactNode }) {
  const tool = findTool(useLocation().pathname);
  if (!tool) return null;
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{tool.title}</h1>
        <p className="text-sm text-[var(--color-muted)]">
          {tool.description}{" "}
          {tool.author && (
            <span className="text-zinc-500">
              · built by{" "}
              {tool.authorUrl ? <a href={tool.authorUrl} target="_blank" rel="noopener" className="text-[var(--color-accent)] hover:underline">{tool.author}</a> : tool.author}
            </span>
          )}
          {REPO_URL && (
            <a href={`${REPO_URL}/blob/main/src/pages/tools/${tool.slug}.tsx`} target="_blank" rel="noopener" className="ml-1 text-zinc-500 hover:text-white">· view source</a>
          )}
        </p>
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

/** Vey reacting to the current result — one line, no layout jump. */
export function VeyStatus({ mood, children }: { mood: Mood; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-sm" role="status">
      <Mascot size={22} mood={mood} />
      <span className={mood === "oops" ? "text-red-300" : "text-[var(--color-muted)]"}>{children}</span>
    </div>
  );
}

type Option<T extends string> = { value: T; label: ReactNode; title?: string };

/** One-of-many choice rendered as a pill group. Use instead of loose toggle buttons. */
export function Segmented<T extends string>({ label, options, value, onChange, size = "md" }: { label?: string; options: Option<T>[]; value: T; onChange: (v: T) => void; size?: "sm" | "md" }) {
  return (
    <div className="flex items-center gap-2">
      {label && <span className="text-xs text-[var(--color-muted)]">{label}</span>}
      <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap rounded-[18px] border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5">
        {options.map((o) => (
          <button
            key={o.value}
            role="radio"
            aria-checked={value === o.value}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={`rounded-full transition ${size === "sm" ? "px-2.5 py-0.5 text-xs" : "px-3 py-1 text-sm"} ${value === o.value ? "bg-[var(--color-accent)] text-black font-medium" : "text-[var(--color-muted)] hover:text-white"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** On/off switch with a visible label. */
export function Toggle({ checked, onChange, children, title }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; title?: string }) {
  return (
    <button role="switch" aria-checked={checked} title={title} onClick={() => onChange(!checked)} className="flex items-center gap-2 text-sm text-[var(--color-muted)] hover:text-white">
      <span className={`relative h-5 w-9 rounded-full border transition ${checked ? "bg-[var(--color-accent)] border-[var(--color-accent)]" : "bg-[var(--color-surface-2)] border-[var(--color-border)]"}`}>
        <span className={`absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all ${checked ? "left-[18px] bg-black" : "left-0.5 bg-zinc-500"}`} />
      </span>
      <span className={checked ? "text-white" : ""}>{children}</span>
    </button>
  );
}

/** Labelled block: small caps label + optional meta on the left, actions on the right, content below. */
export function Panel({ label, meta, actions, children, className = "" }: { label: ReactNode; meta?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`space-y-2 min-w-0 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 min-h-7">
        <div className="text-xs font-mono text-[var(--color-muted)] uppercase tracking-wide">
          {label}
          {meta && <span className="normal-case tracking-normal text-zinc-500"> · {meta}</span>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-1.5">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

/** Reads the clipboard into a setter. Browsers may refuse — the button just flashes. */
export function PasteButton({ onPaste }: { onPaste: (text: string) => void }) {
  const [msg, flash] = useFlash();
  return (
    <button
      className={btnSm}
      onClick={() =>
        navigator.clipboard?.readText
          ? navigator.clipboard.readText().then((t) => (t ? onPaste(t) : flash("Clipboard empty")), () => flash("Paste blocked — use ⌘V"))
          : flash("Use ⌘V")
      }
    >
      {msg || "Paste"}
    </button>
  );
}
