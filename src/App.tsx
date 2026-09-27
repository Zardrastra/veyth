import { Suspense, useEffect } from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import { Mascot } from "./components/Mascot";
import { CommandPalette } from "./components/CommandPalette";
import { useCommandPalette } from "./lib/useCommandPalette";
import { PAGES, SITE, TOOLS, findTool } from "./tools";
import { SUGGEST_URL, TIP_URL } from "./lib/env";

function setMeta(selector: string, attr: string, value: string) {
  document.querySelector(selector)?.setAttribute(attr, value);
}

/** Keeps title/description/canonical/OG in sync on client-side navigation (prerendered HTML sets them on first load). */
function usePageMeta(pathname: string) {
  useEffect(() => {
    const tool = findTool(pathname);
    const page = PAGES.find((p) => p.path === pathname);
    const title = tool ? `${tool.title} — veyth.eu` : page ? `${page.title} — veyth.eu` : SITE.title;
    const description = tool?.description ?? page?.description ?? SITE.description;
    const url = SITE.url + (pathname === "/" ? "/" : pathname.replace(/\/$/, ""));
    document.title = title;
    setMeta('meta[name="description"]', "content", description);
    setMeta('link[rel="canonical"]', "href", url);
    setMeta('meta[property="og:title"]', "content", title);
    setMeta('meta[property="og:description"]', "content", description);
    setMeta('meta[property="og:url"]', "content", url);
  }, [pathname]);
}

export default function App() {
  const loc = useLocation();
  const palette = useCommandPalette();
  usePageMeta(loc.pathname);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-10 border-b border-[var(--color-border)] bg-[var(--color-bg)]/80 backdrop-blur">
        <div className="mx-auto max-w-5xl px-4 h-14 flex items-center justify-between gap-4">
          <Link to="/" className="flex shrink-0 items-center gap-2 font-mono font-bold tracking-tight text-lg group">
            <span className="transition group-hover:rotate-[-6deg] group-hover:scale-105"><Mascot size={28} /></span>
            veyth<span className="text-[var(--color-accent)]">.eu</span>
          </Link>
          <div className="flex min-w-0 items-center gap-2">
            <nav className="hidden md:flex items-center gap-1 text-sm">
              {TOOLS.map((t) => (
                <Link
                  key={t.slug}
                  to={t.path}
                  className={`px-3 py-1.5 rounded-full whitespace-nowrap transition ${loc.pathname === t.path ? "bg-[var(--color-surface-2)] text-white" : "text-[var(--color-muted)] hover:text-white hover:bg-[var(--color-surface)]"}`}
                >
                  {t.nav}
                </Link>
              ))}
            </nav>
            <button
              onClick={() => palette.setOpen(true)}
              className="flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs text-[var(--color-muted)] hover:text-white"
              aria-label="Open tool search"
            >
              <span className="md:hidden">Tools</span>
              <kbd className="font-mono">⌘K</kbd>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-5xl px-4 py-8">
        <Suspense fallback={<div className="text-sm text-[var(--color-muted)]">Loading…</div>}>
          {/* Keyed on the fragment so opening a different share link for the same tool reloads its state */}
          <Outlet key={loc.pathname + loc.hash} />
        </Suspense>
      </main>

      <CommandPalette open={palette.open} onClose={() => palette.setOpen(false)} />

      <footer className="border-t border-[var(--color-border)] mt-8">
        <div className="mx-auto max-w-5xl px-4 py-6 flex flex-wrap gap-4 items-center justify-between text-xs text-[var(--color-muted)]">
          <p>© {new Date().getFullYear()} veyth.eu — tools run locally in your browser. No tracking.</p>
          <div className="flex flex-wrap gap-4">
            <Link to="/about" className="hover:text-white">about</Link>
            <Link to="/privacy" className="hover:text-white">privacy</Link>
            <Link to="/thanks" className="hover:text-white">thanks</Link>
            {SUGGEST_URL && <a href={SUGGEST_URL} target="_blank" rel="noopener" className="hover:text-white">suggest a tool</a>}
            <a href="/sitemap.xml" className="hover:text-white">sitemap</a>
            {TIP_URL && (
              <a href={TIP_URL} target="_blank" rel="noopener" className="text-[var(--color-accent)] hover:underline">
                Support on Ko-fi ☕
              </a>
            )}
          </div>
        </div>
        {/* Ad slot — replace data-attrs with your Carbon/EthicalAds ID when ready */}
        <div className="mx-auto max-w-5xl px-4 pb-6">
          <div
            id="ad-slot"
            data-ad-slot="veyth-footer"
            className="hidden min-h-[90px] items-center justify-center rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] text-xs text-[var(--color-muted)]"
            style={{ display: "none" }}
          >
            Ad placeholder — set VITE_AD_CLIENT to enable
          </div>
        </div>
      </footer>
    </div>
  );
}
