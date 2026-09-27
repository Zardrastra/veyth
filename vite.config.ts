import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

type Route = { path: string; title: string; description: string; body: string };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * After build, write one static HTML file per route (dist/json.html, …) with its own
 * title/description/canonical/OG tags and a crawlable heading in #root, plus sitemap.xml.
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
      const toolList = tools
        .map((t: { slug: string; title: string; description: string }) => `<li><a href="/${t.slug}">${esc(t.title)}</a> — ${esc(t.description)}</li>`)
        .join("");

      const routes: Route[] = [
        { path: "/", title: site.title, description: site.description, body: `<h1>${esc(site.title)}</h1><p>${esc(site.description)}</p><ul>${toolList}</ul>` },
        ...tools.map((t: { slug: string; title: string; description: string }) => ({
          path: `/${t.slug}`,
          title: `${t.title} — veyth.eu`,
          description: t.description,
          body: `<h1>${esc(t.title)}</h1><p>${esc(t.description)}</p><p>Runs entirely in your browser — nothing is uploaded.</p>`,
        })),
        ...pages.map((p: { path: string; title: string; description: string }) => ({
          path: p.path,
          title: `${p.title} — veyth.eu`,
          description: p.description,
          body: `<h1>${esc(p.title)}</h1><p>${esc(p.description)}</p>`,
        })),
      ];

      for (const r of routes) {
        const url = siteUrl + r.path;
        const html = template
          .replace(/<title>[^<]*<\/title>/, `<title>${esc(r.title)}</title>`)
          .replace(/(<meta name="description" content=")[^"]*"/, `$1${esc(r.description)}"`)
          .replace(/(<link rel="canonical" href=")[^"]*"/, `$1${url}"`)
          .replace(/(<meta property="og:title" content=")[^"]*"/, `$1${esc(r.title)}"`)
          .replace(/(<meta property="og:description" content=")[^"]*"/, `$1${esc(r.description)}"`)
          .replace(/(<meta property="og:url" content=")[^"]*"/, `$1${url}"`)
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
