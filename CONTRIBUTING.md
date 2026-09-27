# Contributing to veyth.eu

Thanks for helping! veyth is a set of tiny, private, client-side tools. Contributors are credited on the tool page and on [/thanks](https://veyth.eu/thanks).

## Ground rules

- **Everything runs in the browser.** No network requests with user data, no uploads, no analytics, no cookies.
- **Small is the point.** A tool is one file. Prefer Web APIs (Web Crypto, `TextEncoder`, `Intl`) over dependencies; new npm packages need a good reason.
- **Credentials stay out of URLs.** Tools may put their input in the share link (the `#` fragment), except for secrets like tokens or keys.

## Add a tool (≈ 2 files)

1. Add an entry to `tools` in [`src/site.json`](src/site.json):

   ```json
   {
     "slug": "cron",
     "nav": "Cron",
     "title": "Cron Expression Explainer",
     "description": "One sentence — this becomes the page's meta description.",
     "keywords": "cron expression parser",
     "author": "@your-handle",
     "authorUrl": "https://github.com/your-handle"
   }
   ```

2. Create `src/pages/tools/<slug>.tsx` with a default-exported component. Start from [`encode.tsx`](src/pages/tools/encode.tsx) — it shows the shared pieces:
   - `<ToolHeader>` — title, description and your credit, pulled from `site.json`
   - `useHashState(key, default)` + `<ShareButton params={…}>` — shareable links
   - `<CopyButton>` and `<VeyStatus mood="happy" | "oops" | "idle">`

That's it. Routing, nav, the ⌘K palette, the homepage card, per-page SEO tags, the prerendered HTML and `sitemap.xml` are all generated from `site.json`.

## Smaller contributions

- **Regex patterns:** add an entry to [`src/data/regex-patterns.json`](src/data/regex-patterns.json) with a `name`, `pattern`, `flags` and a `sample` that shows both matches and near-misses.
- **Tool ideas:** open a *Tool request* issue, or 👍 an existing one. The most-upvoted request gets built next.

## Dev

```bash
pnpm install
pnpm run dev     # http://localhost:5173
pnpm run build   # must pass before a PR (tsc + vite + prerender)
```
