// All VITE_* values are baked in at build time; empty string means "feature hidden".
// Tip jar defaults to the real Ko-fi page so a missing .env can't silently hide it; set VITE_TIP_URL= (empty) to turn it off.
export const TIP_URL = (import.meta.env.VITE_TIP_URL as string | undefined) ?? "https://ko-fi.com/veyth";
export const REPO_URL = ((import.meta.env.VITE_REPO_URL as string | undefined) ?? "").replace(/\/$/, "");

export const SUGGEST_URL = REPO_URL ? `${REPO_URL}/issues/new?template=tool-request.yml` : "";
export const REQUESTS_URL = REPO_URL ? `${REPO_URL}/issues?q=is%3Aissue+is%3Aopen+label%3Atool-request+sort%3Areactions-%2B1-desc` : "";
export const AD_CLIENT = (import.meta.env.VITE_AD_CLIENT as string | undefined) ?? "";
