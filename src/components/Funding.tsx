import { TIP_URL } from "../lib/env";
import { useFunding } from "../lib/live";

export function FundingBar() {
  const { monthlyCostEur: cost, pledgedMonthlyEur: pledged } = useFunding();
  const pct = Math.min(100, Math.round((pledged / cost) * 100));
  const covered = pledged >= cost;
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">
          {covered ? "Server covered 🎉" : "Server costs this month"}
        </span>
        <span className="font-mono text-xs text-[var(--color-muted)]">
          €{pledged} / €{cost} per month
        </span>
      </div>
      <div className="h-2 rounded-full bg-[var(--color-surface-2)] overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-[var(--color-accent)] transition-all" style={{ width: `${Math.max(pct, 2)}%` }} />
      </div>
      <p className="text-xs text-[var(--color-muted)]">
        {covered
          ? `Everything above €${cost} goes into building the most-requested tool.`
          : `${TIP_URL ? "A couple of coffees a month" : "A couple of supporters"} keeps this online. Anything extra funds the next requested tool.`}
      </p>
    </div>
  );
}

// Self-hosted look-alike of Ko-fi's button: their badge image/iframe would load ko-fi.com on every
// page view, breaking the "nothing third-party is loaded until you click" promise in the privacy policy.
export function KofiButton({ label = "Support on Ko-fi" }: { label?: string }) {
  if (!TIP_URL) return null;
  return (
    <a href={TIP_URL} target="_blank" rel="noopener" className="inline-flex items-center gap-2 rounded-full bg-[var(--color-accent)] px-5 py-2.5 text-sm font-semibold text-black hover:brightness-110 transition">
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 8h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8Z" />
        <path d="M17 9h1.5a2.5 2.5 0 0 1 0 5H17" />
        <path d="M10.5 15.2s-2.7-1.6-2.7-3.3a1.35 1.35 0 0 1 2.7-.4 1.35 1.35 0 0 1 2.7.4c0 1.7-2.7 3.3-2.7 3.3Z" fill="currentColor" stroke="none" />
      </svg>
      {label}
    </a>
  );
}
