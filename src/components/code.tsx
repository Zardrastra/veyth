import { useRef, type ReactNode, type Ref, type TextareaHTMLAttributes } from "react";
import { highlightJson } from "../lib/highlightJson";

// Shared text metrics — the textarea and its highlight backdrop must match exactly or marks drift.
const METRICS = "p-3 font-mono text-sm leading-6 whitespace-pre-wrap border overflow-y-scroll";

/**
 * Textarea with a highlighted copy of its text rendered underneath. The textarea's own text is
 * transparent, so what you see is the backdrop; the caret and selection still come from the textarea.
 * `highlight` must render exactly `value` (same characters), only wrapped in styled spans.
 * Marks must not change metrics — background/box-shadow only, no padding or borders.
 */
export function HighlightTextarea({
  value,
  onChange,
  highlight,
  breakAll = false,
  className = "h-[240px]",
  ref,
  ...rest
}: {
  ref?: Ref<HTMLTextAreaElement>;
  value: string;
  onChange: (v: string) => void;
  highlight: ReactNode;
  breakAll?: boolean;
  className?: string;
} & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange" | "className">) {
  const backdrop = useRef<HTMLDivElement>(null);
  const wrap = breakAll ? "break-all" : "break-words";
  return (
    <div className={`relative rounded-xl bg-[var(--color-surface)] ${className}`}>
      <div ref={backdrop} aria-hidden className={`absolute inset-0 rounded-xl border-transparent text-[var(--color-text)] pointer-events-none ${METRICS} ${wrap}`}>
        {highlight}
        {"\n "}
      </div>
      <textarea
        {...rest}
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={(e) => {
          if (backdrop.current) backdrop.current.scrollTop = e.currentTarget.scrollTop;
        }}
        spellCheck={false}
        className={`relative block h-full w-full resize-none rounded-xl bg-transparent text-transparent caret-white border-[var(--color-border)] focus:outline-none focus:border-zinc-500 selection:bg-zinc-600/60 selection:text-white placeholder:text-zinc-600 ${METRICS} ${wrap}`}
      />
    </div>
  );
}

export function JsonCode({ value, className = "" }: { value: unknown; className?: string }) {
  const text = JSON.stringify(value, null, 2);
  return <pre className={`font-mono text-sm leading-6 overflow-auto whitespace-pre-wrap break-words ${className}`}>{highlightJson(text)}</pre>;
}
