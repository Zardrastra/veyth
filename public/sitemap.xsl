<?xml version="1.0" encoding="UTF-8"?>
<!-- Renders sitemap.xml as a readable page in browsers. Crawlers ignore it. -->
<xsl:stylesheet version="1.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:s="http://www.sitemaps.org/schemas/sitemap/0.9"
  exclude-result-prefixes="s">
  <xsl:output method="html" encoding="UTF-8" indent="yes" doctype-system="about:legacy-compat"/>

  <xsl:template match="/">
    <html lang="en">
      <head>
        <meta charset="UTF-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <meta name="robots" content="noindex"/>
        <title>Sitemap — veyth.eu</title>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml"/>
        <style>
          :root {
            --bg: #0a0a0a; --surface: #141414; --surface-2: #1c1c1c; --border: #2a2a2a;
            --text: #ededed; --muted: #9a9a9a; --accent: #c8ff00;
            --mono: ui-monospace, "Cascadia Code", "JetBrains Mono", monospace;
          }
          * { box-sizing: border-box; }
          body {
            margin: 0; background: var(--bg); color: var(--text);
            font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; line-height: 1.5;
          }
          main { max-width: 56rem; margin: 0 auto; padding: 3rem 1rem 4rem; }
          header { display: flex; align-items: center; gap: .75rem; margin-bottom: .5rem; }
          header img { width: 32px; height: 32px; }
          h1 { font-size: 1.5rem; margin: 0; font-weight: 600; letter-spacing: -.01em; }
          h1 span { color: var(--accent); }
          p.lede { color: var(--muted); margin: 0 0 2rem; font-size: .925rem; }
          p.lede a { color: var(--text); }
          .card { background: var(--surface); border: 1px solid var(--border); border-radius: .75rem; overflow: hidden; }
          table { width: 100%; border-collapse: collapse; font-size: .925rem; }
          th {
            text-align: left; font-weight: 500; color: var(--muted); font-size: .75rem;
            text-transform: uppercase; letter-spacing: .06em;
            padding: .75rem 1rem; background: var(--surface-2); border-bottom: 1px solid var(--border);
          }
          td { padding: .75rem 1rem; border-bottom: 1px solid var(--border); vertical-align: middle; }
          tr:last-child td { border-bottom: 0; }
          tbody tr:hover { background: var(--surface-2); }
          td.url a { color: var(--text); text-decoration: none; font-family: var(--mono); word-break: break-all; }
          td.url a:hover { color: var(--accent); }
          td.url .host { color: var(--muted); }
          td.num { text-align: right; white-space: nowrap; font-family: var(--mono); color: var(--muted); }
          th.num { text-align: right; }
          .bar { display: inline-block; width: 3rem; height: 4px; border-radius: 2px; background: var(--border); vertical-align: middle; margin-right: .5rem; overflow: hidden; }
          .bar i { display: block; height: 100%; background: var(--accent); }
          footer { margin-top: 1.5rem; color: var(--muted); font-size: .8rem; }
          footer a { color: var(--muted); }
          @media (max-width: 480px) { .bar { display: none; } td, th { padding: .6rem .75rem; } }
        </style>
      </head>
      <body>
        <main>
          <header>
            <img src="/favicon.svg" alt=""/>
            <h1>veyth<span>.</span>eu sitemap</h1>
          </header>
          <p class="lede">
            <xsl:value-of select="count(s:urlset/s:url)"/> pages. This is the XML sitemap search engines read —
            styled for humans. <a href="/">Back to the tools →</a>
          </p>
          <div class="card">
            <table>
              <thead>
                <tr>
                  <th>URL</th>
                  <xsl:if test="s:urlset/s:url/s:lastmod"><th class="num">Last modified</th></xsl:if>
                  <th class="num">Priority</th>
                </tr>
              </thead>
              <tbody>
                <xsl:for-each select="s:urlset/s:url">
                  <xsl:sort select="s:priority" order="descending" data-type="number"/>
                  <xsl:variable name="loc" select="s:loc"/>
                  <xsl:variable name="host" select="concat(substring-before($loc, '//'), '//', substring-before(substring-after($loc, '//'), '/'))"/>
                  <tr>
                    <td class="url">
                      <a href="{$loc}">
                        <span class="host"><xsl:value-of select="$host"/></span>
                        <xsl:value-of select="substring-after($loc, $host)"/>
                      </a>
                    </td>
                    <xsl:if test="/s:urlset/s:url/s:lastmod">
                      <td class="num"><xsl:value-of select="substring(s:lastmod, 1, 10)"/></td>
                    </xsl:if>
                    <td class="num">
                      <span class="bar"><i style="width: {s:priority * 100}%"></i></span>
                      <xsl:value-of select="s:priority"/>
                    </td>
                  </tr>
                </xsl:for-each>
              </tbody>
            </table>
          </div>
          <footer>Raw XML: view source. Protocol: <a href="https://www.sitemaps.org/protocol.html">sitemaps.org</a>.</footer>
        </main>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
