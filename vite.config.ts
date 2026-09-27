import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ogPng, type OgCard } from "./scripts/og";

type Route = { path: string; title: string; description: string; body: string; og: OgCard };
type ToolEntry = { slug: string; nav: string; title: string; description: string; glyph?: string };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * After build, write one static HTML file per route (dist/json.html, …) with its own
 * title/description/canonical/OG tags and a crawlable heading in #root, plus sitemap.xml
 * and a link-preview image per route (dist/og/<name>.<hash>.png, see scripts/og.ts).
 * Caddy serves /json → json.html; React then mounts over the placeholder content.
 * Routes come from src/site.json — the same registry the app uses.
 */
function prerenderShells(siteUrl: string): Plugin {
  let outDir = "dist";
  let root = ".";
  return {
    name: "veyth-prerender-shells",
    apply: "build",
    configResolved(c) {
      root = c.root;
      outDir = resolve(c.root, c.build.outDir);
    },
    closeBundle() {
      const { site, tools, pages } = JSON.parse(readFileSync(resolve(root, "src/site.json"), "utf8"));
      const template = readFileSync(resolve(outDir, "index.html"), "utf8");
      const toolList = (tools as ToolEntry[])
        .map((t) => `<li><a href="/${t.slug}">${esc(t.title)}</a> — ${esc(t.description)}</li>`)
        .join("");

      const routes: Route[] = [
        {
          path: "/",
          title: site.title,
          description: site.description,
          body: `<h1>${esc(site.title)}</h1><p>${esc(site.description)}</p><ul>${toolList}</ul>`,
          og: {
            path: "/",
            title: "Tiny tools,\n*no tracking.*",
            description: "Fast, private tools for developers and makers. Everything runs in your browser.",
            chips: (tools as ToolEntry[]).map((t) => t.nav),
          },
        },
        ...(tools as ToolEntry[]).map((t) => ({
          path: `/${t.slug}`,
          title: `${t.title} — veyth.eu`,
          description: t.description,
          body: `<h1>${esc(t.title)}</h1><p>${esc(t.description)}</p><p>Runs entirely in your browser — nothing is uploaded.</p>`,
          og: { path: `/${t.slug}`, title: t.title, description: t.description, glyph: t.glyph ?? t.nav, tagline: "Runs in your browser — nothing is uploaded" },
        })),
        ...pages.map((p: { path: string; title: string; description: string }) => ({
          path: p.path,
          title: `${p.title} — veyth.eu`,
          description: p.description,
          body: `<h1>${esc(p.title)}</h1><p>${esc(p.description)}</p>`,
          og: { path: p.path, title: p.title, description: p.description, mood: p.path === "/thanks" ? ("love" as const) : undefined },
        })),
      ];

      mkdirSync(resolve(outDir, "og"), { recursive: true });
      for (const r of routes) {
        const url = siteUrl + r.path;
        // Hashed name: Caddy serves *.png as immutable, so a changed image needs a new URL.
        const { png, hash } = ogPng(r.og);
        const image = `/og/${r.path === "/" ? "home" : r.path.slice(1)}.${hash}.png`;
        writeFileSync(resolve(outDir, image.slice(1)), png);
        const html = template
          .replace(/<title>[^<]*<\/title>/, `<title>${esc(r.title)}</title>`)
          .replace(/(<meta name="description" content=")[^"]*"/, `$1${esc(r.description)}"`)
          .replace(/(<link rel="canonical" href=")[^"]*"/, `$1${url}"`)
          .replace(/(<meta property="og:title" content=")[^"]*"/, `$1${esc(r.title)}"`)
          .replace(/(<meta property="og:description" content=")[^"]*"/, `$1${esc(r.description)}"`)
          .replace(/(<meta property="og:url" content=")[^"]*"/, `$1${url}"`)
          .replace(/(<meta property="og:image" content=")[^"]*"/, `$1${siteUrl}${image}"`)
          .replace(/(<meta property="og:image:alt" content=")[^"]*"/, `$1${esc(r.title)}"`)
          .replace(/(<meta name="twitter:title" content=")[^"]*"/, `$1${esc(r.title)}"`)
          .replace(/(<meta name="twitter:description" content=")[^"]*"/, `$1${esc(r.description)}"`)
          .replace('<div id="root"></div>', `<div id="root">${r.body}</div>`);
        writeFileSync(resolve(outDir, r.path === "/" ? "index.html" : `${r.path.slice(1)}.html`), html);
      }

      const sitemap =
        `<?xml version="1.0" encoding="UTF-8"?>\n<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
        routes.map((r) => `  <url><loc>${siteUrl}${r.path}</loc><priority>${r.path === "/" ? "1.0" : "0.8"}</priority></url>`).join("\n") +
        `\n</urlset>\n`;
      writeFileSync(resolve(outDir, "sitemap.xml"), sitemap);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const siteUrl = (env.VITE_SITE_URL || "https://veyth.eu").replace(/\/$/, "");
  return {
    plugins: [react(), tailwindcss(), prerenderShells(siteUrl)],
    build: {
      outDir: "dist",
    },
  };
});
