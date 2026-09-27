import { flushSync } from "react-dom";
import { Link } from "react-router-dom";
import { Mascot } from "../components/Mascot";
import { FundingBar, KofiButton } from "../components/Funding";
import { TOOLS } from "../tools";
import { usePinned } from "../lib/storage";
import { REPO_URL, REQUESTS_URL, SUGGEST_URL } from "../lib/env";

export default function Home() {
  const { pinned, toggle } = usePinned();
  // Pinned tools in the order they were pinned, then the rest in site order.
  const pinnedTools = pinned.map((s) => TOOLS.find((t) => t.slug === s)).filter((t) => t !== undefined);
  const otherTools = TOOLS.filter((t) => !pinned.includes(t.slug));
  const hasPinned = pinnedTools.length > 0;

  // Animate cards sliding between sections where the View Transitions API exists; plain toggle elsewhere.
  function onToggle(slug: string) {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !document.startViewTransition) return toggle(slug);
    // `ready` rejects when the browser skips the animation (e.g. tab hidden); the toggle still applies.
    document.startViewTransition(() => flushSync(() => toggle(slug))).ready.catch(() => {});
  }

  return (
    <div className="space-y-10">
      <section className="space-y-4 pt-4">
        <div className="flex gap-6 items-start">
          <div className="hidden sm:flex shrink-0">
            <Mascot size={128} interactive />
          </div>
          <div className="space-y-4">
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight leading-tight">
              Tiny tools,
              <br />
              <span className="text-[var(--color-accent)]">no tracking.</span>
            </h1>
            <p className="max-w-2xl text-[var(--color-muted)] leading-relaxed">
              Fast, private utilities for developers. Everything runs in your browser — nothing is uploaded,
              and share links keep your data after the <code className="font-mono text-xs">#</code>, where the server never sees it.
            </p>
            <p className="text-xs text-zinc-500">
              Press <kbd className="font-mono rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-0.5">⌘K</kbd> to jump to any tool.
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
          {/* One grid for both sections so a card keeps its DOM node (and keyboard focus) when it moves. */}
          {hasPinned && <SectionLabel key="label-pinned">Pinned</SectionLabel>}
          {[...pinnedTools, ...otherTools].flatMap((t, i) => {
            const isPinned = pinned.includes(t.slug);
            const card = (
              <div key={t.slug} style={{ viewTransitionName: `tool-${t.slug}` }} className="group relative rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-2)] hover:border-zinc-700 transition">
                <Link to={t.path} className="block p-5 pr-12">
                  <h2 className="font-semibold group-hover:text-[var(--color-accent)] transition">{t.title}</h2>
                  <p className="text-sm text-[var(--color-muted)] mt-1 leading-relaxed">{t.description}</p>
                  <span className="inline-block mt-3 text-xs font-mono text-zinc-500">{t.author ? `by ${t.author}` : t.keywords}</span>
                </Link>
                <button
                  onClick={() => onToggle(t.slug)}
                  aria-pressed={isPinned}
                  aria-label={isPinned ? `Unpin ${t.title}` : `Pin ${t.title}`}
                  title={isPinned ? "Unpin" : "Pin (saved in this browser)"}
                  className={`absolute top-4 right-4 w-7 h-7 rounded-full text-sm transition ${isPinned ? "text-[var(--color-accent)]" : "text-zinc-600 opacity-0 group-hover:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-100 hover:text-white"}`}
                >
                  {isPinned ? "★" : "☆"}
                </button>
              </div>
            );
            // flatMap keeps cards and labels as keyed siblings, so no card remounts when the label moves.
            return hasPinned && i === pinnedTools.length ? [<SectionLabel key="label-all">All tools</SectionLabel>, card] : [card];
          })}
          {SUGGEST_URL && (
            <a href={SUGGEST_URL} target="_blank" rel="noopener" className="flex flex-col justify-center rounded-2xl border border-dashed border-[var(--color-border)] p-5 hover:border-zinc-600 transition">
              <h2 className="font-semibold">+ Suggest a tool</h2>
              <p className="text-sm text-[var(--color-muted)] mt-1">A new tool is built every month — the most-upvoted request goes first.</p>
            </a>
          )}
        </div>
        {REQUESTS_URL && (
          <p className="text-xs text-zinc-500">
            <a href={REQUESTS_URL} target="_blank" rel="noopener" className="hover:text-white">See and upvote requested tools →</a>
          </p>
        )}
      </section>

      <section className="grid md:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 space-y-4">
          <h3 className="font-semibold">Kept alive by its users</h3>
          <FundingBar />
          <div className="flex flex-wrap gap-3 items-center">
            <KofiButton />
            <Link to="/thanks" className="text-sm text-[var(--color-muted)] hover:text-white">Who's helped so far →</Link>
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 space-y-3">
          <h3 className="font-semibold">About</h3>
          <p className="text-sm text-[var(--color-muted)] leading-relaxed">
            veyth.eu is a one-person project on a small EU server. No accounts, no cookies, no analytics —
            just static files and your browser doing the work.{" "}
            <Link to="/about" className="text-[var(--color-accent)] hover:underline">More about veyth →</Link>
          </p>
          {REPO_URL && (
            <p className="text-sm text-[var(--color-muted)] leading-relaxed">
              Every tool is a single small file.{" "}
              <a href={REPO_URL} target="_blank" rel="noopener" className="text-[var(--color-accent)] hover:underline">Read the source or add your own</a>{" "}
              — contributors get credited on the tool they built.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h2 className="col-span-full text-xs font-medium uppercase tracking-wider text-zinc-500 first:mt-0 mt-2">{children}</h2>;
}
