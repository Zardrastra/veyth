# veyth.eu — tiny tools, no tracking

Fast, private tools for developers and makers. Everything runs in your browser: nothing you paste or drop in is uploaded, there are no accounts, no cookies and no analytics.

## Tools

| Path | Tool | What it does |
| --- | --- | --- |
| `/json` | JSON Formatter & Validator | Format, validate, minify and sort keys, with exact error locations, one-click fixes and a tree view |
| `/uuid` | UUID & Hash | Generate v4/v7 UUIDs in bulk, inspect any UUID, and SHA-256/512 or HMAC hash text and files (Web Crypto) |
| `/regex` | Regex Tester | Live match highlighting, capture groups, replace preview, a cheat sheet and a library of common patterns |
| `/encode` | Base64 & URL Encoder / Decoder | Base64, Base64URL, URL, Hex and HTML entities — UTF-8 safe, auto-detects encoded input |
| `/jwt` | JWT Decoder | Decode tokens and verify HS/RS/PS/ES signatures locally, with claims explained; hand off to the JSON tool |
| `/image` | Image Resizer & Converter | Resize, compress and convert JPG/PNG/WebP/AVIF in bulk or to a max file size; strips EXIF/GPS, zip download |
| `/color` | Color Picker from Image | Sample a color from a photo with a zoom dropper (1 px to 9×9 average), refine it in a honeycomb of nearby shades, copy HEX/RGB/HSL/HSB/OKLCH/CMYK |

Also on the site:

- `/` — all tools at a glance; pin favourites with ★ (kept in your browser) and jump anywhere with ⌘K
- `/thanks` — the supporters and contributors behind the site
- `/about` and `/privacy` — who runs it and exactly what is (and isn't) collected

**Shareable, private links:** tool state lives in the URL fragment (`#…`), which browsers never send to the server, so you can share a link to your input without it touching veyth.eu.

## Principles

- **Local-first.** Tools work on your data in the page itself; files and tokens never leave your device.
- **No tracking.** No cookies, no analytics, no access logs. The server's error log has client IPs and headers stripped.
- **Small and fast.** A static site with no backend or database; each tool is prerendered as its own page.
- **Community-shaped.** New tools come from requests and contributions.

## Stack

Vite + React 19 + TypeScript + Tailwind 4 + React Router 7, built with `pnpm`. Served as static files by Caddy.

## Development

```bash
pnpm install
pnpm run dev          # http://localhost:5173
pnpm run build        # tsc + vite → dist/
pnpm run preview
```

**Adding a tool:** add an entry to `src/site.json` and create `src/pages/tools/<slug>.tsx`. The router, nav, ⌘K palette, homepage, per-page meta, prerendered `dist/<slug>.html` and `sitemap.xml` are all generated from `site.json`. See `CONTRIBUTING.md` for details.

## Contributing & requesting tools

- Have an idea? Open a tool request (`.github/ISSUE_TEMPLATE/tool-request.yml`, label `tool-request`) — requests are prioritised by 👍.
- Contributors are credited automatically on `/thanks` via each tool's `author` field.
- Set `VITE_REPO_URL` to the public repo to enable the "Suggest a tool", "view source" and contributor links on the site.

## Supporting the site

veyth.eu is kept running by people who chip in on Ko-fi (`VITE_TIP_URL`, default https://ko-fi.com/veyth). Supporters who opt in are listed on `/thanks`, and a small bar shows how close the month's hosting is to being covered.

That data comes from a tiny Ko-fi webhook receiver — the only server-side code:

- `server/kofi.mjs` (zero-dependency Node, systemd unit `veyth-kofi`) listens on `127.0.0.1:8787`; Caddy proxies `POST /api/kofi` to it. It verifies the token, dedupes by `message_id`, and rewrites `/var/lib/veyth/live/{funding,supporters}.json`, which Caddy serves at `/live/*` and the site fetches on load. `src/data/funding.json` / `people.json` are the fallback and hold hand-added people.
- **Totals** = latest subscription payment per supporter + one-off donations, over a rolling 31 days (Ko-fi never sends cancellations). EUR only; shop orders/commissions and Ko-fi test events are ignored.
- **Privacy:** no emails or messages are stored (the payer is an HMAC key), and names appear only when the supporter ticked "public". Events older than 400 days are pruned.
- **Setup (once):** on the server create `/etc/veyth/kofi.env` from `server/kofi.env.example` (`chmod 600`), run `./deploy.sh`, then in Ko-fi → Settings → API set the webhook URL to `https://veyth.eu/api/kofi`.
- Logs: `journalctl -u veyth-kofi`.

## Deploy (VPS: `ssh veyth`)

Fresh Ubuntu 26.04, no Docker needed. `Caddyfile` is installed as `/etc/caddy/Caddyfile` (the VPS only hosts veyth): auto-TLS, `www` → apex redirect.

```bash
./deploy.sh              # build + rsync + install/validate/reload Caddy + Ko-fi receiver
./deploy.sh --skip-build # sync existing dist/
```

Caddy and Node auto-install if missing. The Caddyfile is validated before it replaces the live one. Once per server: DNS A/AAAA for `veyth.eu` + `www`, and open 80/tcp, 443/tcp, 443/udp.

## Environment

Copy `.env.example` → `.env` and set `VITE_REPO_URL` etc. (`VITE_TIP_URL` has a default). All `VITE_*` variables are baked in at `pnpm run build` time.
