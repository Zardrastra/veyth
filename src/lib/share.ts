import { useState } from "react";
import { useLocation } from "react-router-dom";

// Tool state lives in the URL *fragment* (#…). Browsers never send the fragment to the
// server, so shared links stay private to whoever holds them — no logs, no tracking.

export function useHashParams(): URLSearchParams {
  const { hash } = useLocation();
  return new URLSearchParams(hash.slice(1));
}

/** useState seeded from `#key=…` on first render, falling back to `fallback`. */
export function useHashState(key: string, fallback: string) {
  const params = useHashParams();
  return useState(() => params.get(key) ?? fallback);
}

export function hashFor(params: Record<string, string>): string {
  return "#" + new URLSearchParams(params).toString();
}

export function shareUrl(params: Record<string, string>): string {
  return `${location.origin}${location.pathname}${hashFor(params)}`;
}

/** Links longer than this get mangled by chat apps and some browsers. */
export const MAX_SHARE_LENGTH = 32_000;
