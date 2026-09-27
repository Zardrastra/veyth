import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import site from "./site.json";

// Single source of truth for tools. To add one:
//   1. add an entry to `tools` in src/site.json (slug, nav, title, description, keywords, glyph?, author?)
//   2. create src/pages/tools/<slug>.tsx with a default export
// Router, nav, homepage, ⌘K palette, per-page meta, prerendered HTML and sitemap all read from here.

export type ToolMeta = {
  slug: string;
  nav: string;
  title: string;
  description: string;
  keywords: string;
  /** Short text Vey holds up in the link-preview image, e.g. "{ }" (defaults to `nav`) */
  glyph?: string;
  /** Optional credit shown on the tool page, e.g. "@handle" */
  author?: string;
  authorUrl?: string;
};

export type Tool = ToolMeta & {
  path: string;
  Component: LazyExoticComponent<ComponentType>;
};

export const SITE = site.site;
export const PAGES = site.pages;

const modules = import.meta.glob<{ default: ComponentType }>("./pages/tools/*.tsx");

export const TOOLS: Tool[] = (site.tools as ToolMeta[]).map((t) => {
  const load = modules[`./pages/tools/${t.slug}.tsx`];
  if (!load) throw new Error(`Tool "${t.slug}" is in site.json but src/pages/tools/${t.slug}.tsx is missing`);
  return { ...t, path: `/${t.slug}`, Component: lazy(load) };
});

export function findTool(pathname: string): Tool | undefined {
  return TOOLS.find((t) => t.path === pathname.replace(/\/$/, ""));
}
