import { useEffect, useState } from "react";
import bundledFunding from "../data/funding.json";

// Written on the server by the Ko-fi webhook (server/kofi.mjs) and served from /live/.
// The bundled JSON is the fallback for dev, prerender, and before the first payment.

export type Funding = { monthlyCostEur: number; pledgedMonthlyEur: number };
export type Supporter = { name: string; url?: string };

function useLive<T>(path: string, fallback: T, valid: (v: unknown) => v is T): T {
  const [value, setValue] = useState<T>(fallback);
  useEffect(() => {
    let cancelled = false;
    fetch(path, { headers: { Accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((v: unknown) => {
        if (!cancelled && valid(v)) setValue(v);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [path, valid]);
  return value;
}

const isFunding = (v: unknown): v is Funding =>
  typeof v === "object" && v !== null &&
  typeof (v as Funding).monthlyCostEur === "number" &&
  typeof (v as Funding).pledgedMonthlyEur === "number";

const isSupporters = (v: unknown): v is { supporters: Supporter[] } =>
  typeof v === "object" && v !== null &&
  Array.isArray((v as { supporters: unknown }).supporters) &&
  (v as { supporters: unknown[] }).supporters.every((s) => typeof (s as Supporter)?.name === "string");

export const useFunding = () => useLive<Funding>("/live/funding.json", bundledFunding, isFunding);

const NO_SUPPORTERS = { supporters: [] as Supporter[] };
export const useLiveSupporters = () => useLive("/live/supporters.json", NO_SUPPORTERS, isSupporters).supporters;
