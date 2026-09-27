import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TOOLS } from "../tools";
import { SUGGEST_URL, TIP_URL } from "../lib/env";
import { usePinned } from "../lib/storage";

type Item = { id: string; label: string; hint: string; pinned?: boolean; run: () => void };

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Mounting only while open gives every opening an empty query and the first item selected.
  return open ? <Palette onClose={onClose} /> : null;
}

function Palette({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { pinned } = usePinned();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);

  const items = useMemo<Item[]>(() => {
    const go = (to: string) => () => navigate(to);
    const ext = (url: string) => () => window.open(url, "_blank", "noopener");
    const rank = (slug: string) => (pinned.includes(slug) ? pinned.indexOf(slug) : pinned.length);
    return [
      // Pinned tools first (in pin order), so they're one ↵ away on an empty query.
      ...[...TOOLS]
        .sort((a, b) => rank(a.slug) - rank(b.slug))
        .map((t) => ({ id: t.slug, label: t.title, hint: `${t.keywords} ${pinned.includes(t.slug) ? "pinned" : ""}`, pinned: pinned.includes(t.slug), run: go(t.path) })),
      { id: "home", label: "Home", hint: "all tools", run: go("/") },
      { id: "about", label: "About veyth.eu", hint: "who why contact", run: go("/about") },
      { id: "privacy", label: "Privacy policy", hint: "gdpr data cookies", run: go("/privacy") },
      { id: "thanks", label: "Supporters & contributors", hint: "thanks credits", run: go("/thanks") },
      ...(SUGGEST_URL ? [{ id: "suggest", label: "Suggest a tool", hint: "request idea vote", run: ext(SUGGEST_URL) }] : []),
      ...(TIP_URL ? [{ id: "support", label: "Support veyth ☕", hint: "tip donate coffee", run: ext(TIP_URL) }] : []),
    ];
  }, [navigate, pinned]);

  const filtered = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return items.filter((i) => words.every((w) => `${i.label} ${i.hint}`.toLowerCase().includes(w)));
  }, [items, q]);

  function run(item: Item | undefined) {
    if (!item) return;
    onClose();
    item.run();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, filtered.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    else if (e.key === "Enter") run(filtered[sel]);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm px-4 pt-[15vh]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label="Command palette"
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          value={q}
          onChange={(e) => { setQ(e.target.value); setSel(0); }}
          onKeyDown={onKeyDown}
          placeholder="Jump to a tool…"
          className="w-full bg-transparent px-4 py-3 text-sm border-b border-[var(--color-border)] focus:outline-none"
        />
        <ul className="max-h-80 overflow-auto py-1" role="listbox">
          {filtered.length === 0 && <li className="px-4 py-3 text-sm text-[var(--color-muted)]">Nothing found.{SUGGEST_URL && " Suggest it?"}</li>}
          {filtered.map((item, i) => (
            <li
              key={item.id}
              role="option"
              aria-selected={i === sel}
              onMouseEnter={() => setSel(i)}
              onClick={() => run(item)}
              className={`mx-1 flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm ${i === sel ? "bg-[var(--color-surface-2)] text-white" : "text-[var(--color-muted)]"}`}
            >
              <span>
                {item.label}
                {item.pinned && <span className="ml-2 text-xs text-[var(--color-accent)]" aria-label="pinned">★</span>}
              </span>
              {i === sel && <span className="text-xs text-zinc-500">↵</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
