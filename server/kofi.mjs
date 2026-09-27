#!/usr/bin/env node
// Ko-fi webhook receiver for veyth.eu — zero dependencies, runs behind Caddy on 127.0.0.1.
//
// Ko-fi POSTs `application/x-www-form-urlencoded` with one field, `data`, holding a JSON string.
// We verify the token, drop duplicates by message_id, keep a minimal event log (no emails, no
// messages, names only when is_public), and atomically rewrite two public files that the site
// fetches at runtime:
//   $LIVE_DIR/funding.json     → { monthlyCostEur, pledgedMonthlyEur, recurringEur, oneOffEur, updated }
//   $LIVE_DIR/supporters.json  → { supporters: [{ name }] }
//
// Env: KOFI_VERIFICATION_TOKEN (required), PORT (8787), STATE_DIR (/var/lib/veyth),
//      LIVE_DIR ($STATE_DIR/live), MONTHLY_COST_EUR (8)

import { createServer } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const TOKEN = process.env.KOFI_VERIFICATION_TOKEN ?? "";
const PORT = Number(process.env.PORT ?? 8787);
const STATE_DIR = process.env.STATE_DIR ?? "/var/lib/veyth";
const LIVE_DIR = process.env.LIVE_DIR ?? join(STATE_DIR, "live");
const MONTHLY_COST_EUR = Number(process.env.MONTHLY_COST_EUR ?? 8);

const EVENTS_FILE = join(STATE_DIR, "kofi-events.json");
const MAX_BODY = 64 * 1024;
const DAY = 24 * 60 * 60 * 1000;
const WINDOW_MS = 31 * DAY; // a monthly subscriber pays at least once per window
const KEEP_MS = 400 * DAY; // prune older events (also bounds the dedupe set)
const COUNTED_TYPES = new Set(["Donation", "Subscription"]);
// Ko-fi's "Send test" button uses this placeholder transaction id.
const TEST_TX = /^0{8}-1111-2222-3333-4{12}$/;

if (!TOKEN) {
  console.error("KOFI_VERIFICATION_TOKEN is not set");
  process.exit(1);
}

mkdirSync(LIVE_DIR, { recursive: true });

/** @type {{ id: string, ts: number, type: string, eur: number, sub: boolean, payer: string, name: string | null }[]} */
let events = [];
try {
  events = JSON.parse(readFileSync(EVENTS_FILE, "utf8"));
} catch {
  events = [];
}

function writeAtomic(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", { mode: 0o644 });
  renameSync(tmp, file);
}

function tokenOk(given) {
  const a = Buffer.from(String(given ?? ""));
  const b = Buffer.from(TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Stable pseudonymous key per payer so a subscriber is counted once per window.
// Keyed with the token so it can't be reversed with a dictionary of emails.
const payerKey = (email) => createHmac("sha256", TOKEN).update(String(email ?? "").trim().toLowerCase()).digest("hex").slice(0, 16);

// eslint-disable-next-line no-control-regex -- strips control characters from payer names
const cleanName = (s) => String(s ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 60);

function publish() {
  const now = Date.now();
  const recent = events.filter((e) => now - e.ts <= WINDOW_MS);

  // Latest subscription payment per payer + all one-off donations in the window.
  const subs = new Map();
  for (const e of recent) if (e.sub) subs.set(e.payer, e.eur);
  const recurringEur = [...subs.values()].reduce((s, v) => s + v, 0);
  const oneOffEur = recent.filter((e) => !e.sub).reduce((s, e) => s + e.eur, 0);
  const round = (n) => Math.round(n * 100) / 100;

  writeAtomic(join(LIVE_DIR, "funding.json"), {
    monthlyCostEur: MONTHLY_COST_EUR,
    pledgedMonthlyEur: round(recurringEur + oneOffEur),
    recurringEur: round(recurringEur),
    oneOffEur: round(oneOffEur),
    updated: new Date(now).toISOString(),
  });

  const seen = new Set();
  const supporters = [];
  for (const e of [...events].reverse()) {
    if (!e.name || seen.has(e.name.toLowerCase())) continue;
    seen.add(e.name.toLowerCase());
    supporters.push({ name: e.name });
    if (supporters.length >= 200) break;
  }
  writeAtomic(join(LIVE_DIR, "supporters.json"), { supporters });
}

/** @returns {number} HTTP status */
function handle(payload) {
  if (!tokenOk(payload.verification_token)) return 401;
  const id = String(payload.message_id ?? "");
  if (!id) return 400;
  if (events.some((e) => e.id === id)) return 200; // Ko-fi retry
  if (TEST_TX.test(String(payload.kofi_transaction_id ?? ""))) {
    console.log(`test event ${id} ignored`);
    return 200;
  }
  if (!COUNTED_TYPES.has(payload.type)) {
    console.log(`event ${id} of type ${payload.type} ignored`);
    return 200;
  }
  const amount = Number.parseFloat(payload.amount);
  if (!Number.isFinite(amount) || amount <= 0) return 400;
  if (String(payload.currency ?? "").toUpperCase() !== "EUR") {
    console.warn(`event ${id} in ${payload.currency} not counted (EUR only)`);
    return 200;
  }

  const ts = Date.parse(payload.timestamp);
  events.push({
    id,
    ts: Number.isFinite(ts) ? ts : Date.now(),
    type: payload.type,
    eur: amount,
    sub: Boolean(payload.is_subscription_payment),
    payer: payerKey(payload.email),
    name: payload.is_public ? cleanName(payload.from_name) || null : null,
  });
  events.sort((a, b) => a.ts - b.ts);
  events = events.filter((e) => Date.now() - e.ts <= KEEP_MS);
  writeAtomic(EVENTS_FILE, events);
  publish();
  console.log(`recorded ${payload.type} ${id}: €${amount}${payload.is_subscription_payment ? " (subscription)" : ""}`);
  return 200;
}

const server = createServer((req, res) => {
  const reply = (status) => {
    res.writeHead(status, { "Content-Type": "text/plain" });
    res.end(status === 200 ? "ok" : "error");
  };
  if (req.method !== "POST" || req.url !== "/api/kofi") return reply(404);

  let size = 0;
  const chunks = [];
  req.on("data", (c) => {
    size += c.length;
    if (size > MAX_BODY) {
      reply(413);
      req.destroy();
    } else chunks.push(c);
  });
  req.on("end", () => {
    if (res.writableEnded) return;
    try {
      const data = new URLSearchParams(Buffer.concat(chunks).toString("utf8")).get("data");
      if (!data) return reply(400);
      reply(handle(JSON.parse(data)));
    } catch (err) {
      console.error("bad request:", err instanceof Error ? err.message : err);
      reply(400);
    }
  });
});

// Ko-fi never announces cancellations, so re-publish hourly to let lapsed payments age out.
publish();
setInterval(publish, 60 * 60 * 1000).unref();
server.listen(PORT, "127.0.0.1", () => console.log(`kofi receiver on 127.0.0.1:${PORT}`));
