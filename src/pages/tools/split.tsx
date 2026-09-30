import { useMemo, useState, type ReactNode } from "react";
import { CopyButton, Panel, Segmented, ShareButton, Toggle, ToolHeader, VeyStatus, btn, btnSm, fieldCls } from "../../components/ui";
import { useHashParams } from "../../lib/share";
import { useStored } from "../../lib/storage";

// Money is handled in minor units (cents) and every split is rounded with the largest-remainder
// method, so the shares always add up to exactly the bill — never a cent over or under.

type Mode = "simple" | "items";
/** `who` lists the people sharing the item by index; empty means everyone. */
type Item = { id: number; name: string; price: string; who: number[] };

const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "SEK", "NOK", "DKK", "PLN", "CZK", "HUF", "CAD", "AUD", "NZD", "JPY", "INR"];
const TIPS = ["0", "10", "12.5", "15", "18", "20"];
const MAX_PEOPLE = 30;
const NAMES = ["Alex", "Sam", "Jo"];
const defaultName = (i: number) => NAMES[i] ?? `Person ${i + 1}`;

let nextId = 1;
const newItem = (name = "", price = "", who: number[] = []): Item => ({ id: nextId++, name, price, who });

const SAMPLE_ITEMS: [string, string, number[]][] = [
  ["Margherita", "12.50", [0]],
  ["Carbonara", "15.90", [1]],
  ["Steak frites", "26.00", [2]],
  ["Bottle of wine", "28.00", [0, 1]],
  ["Garlic bread", "6.50", []],
];

/* ---------- parsing ---------- */

/** "12.50", "12,50", "€1.234,50", "1,234.50" → number. The last separator is the decimal one,
 *  unless exactly three digits follow it (then it groups thousands). */
function parseAmount(s: string): number | null {
  const t = s.replace(/[^\d.,]/g, "");
  if (!/\d/.test(t)) return null;
  const dec = Math.max(t.lastIndexOf("."), t.lastIndexOf(","));
  const frac = dec >= 0 ? t.slice(dec + 1) : "";
  const v = dec < 0 || (frac.length === 3 && !/[.,]/.test(frac))
    ? Number(t.replace(/[.,]/g, ""))
    : Number(`${t.slice(0, dec).replace(/[.,]/g, "")}.${frac}`);
  return Number.isFinite(v) ? v : null;
}

function readPeople(p: URLSearchParams): string[] {
  try {
    const v = JSON.parse(p.get("ppl") ?? "");
    if (Array.isArray(v) && v.length && v.every((x) => typeof x === "string")) return v.slice(0, MAX_PEOPLE);
  } catch { /* fall through */ }
  const n = Math.min(MAX_PEOPLE, Math.max(1, parseInt(p.get("n") ?? "") || NAMES.length));
  return Array.from({ length: n }, (_, i) => defaultName(i));
}

function readItems(p: URLSearchParams): Item[] {
  try {
    const v = JSON.parse(p.get("it") ?? "");
    if (Array.isArray(v))
      return v
        .filter((x) => Array.isArray(x) && typeof x[0] === "string" && typeof x[1] === "string")
        .map((x) => newItem(x[0], x[1], Array.isArray(x[2]) ? x[2].filter((w: unknown) => Number.isInteger(w)) : []));
  } catch { /* fall through */ }
  return SAMPLE_ITEMS.map(([n, pr, w]) => newItem(n, pr, w));
}

/* ---------- maths ---------- */

/** Round each exact share to whole minor units so they sum to `total`: floor everything,
 *  then hand the leftover units to the largest fractional parts (earlier people win ties). */
function allocate(exact: number[], total: number): number[] {
  const out = exact.map((e) => Math.floor(e + 1e-9));
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = exact.map((e, i) => [e - out[i], i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of order) {
    if (left <= 0) break;
    out[i]++;
    left--;
  }
  return out;
}

function simpleSplit(bill: number, n: number, pct: number, roundUp: boolean, unit: number) {
  const tip = Math.round((bill * pct) / 100);
  if (roundUp) {
    const each = Math.ceil((bill + tip) / n / unit) * unit;
    return { tip: each * n - bill, total: each * n, shares: Array<number>(n).fill(each) };
  }
  return { tip, total: bill + tip, shares: allocate(Array(n).fill((bill + tip) / n), bill + tip) };
}

type Line = { name: string; ways: number; amount: number };

function itemSplit(n: number, items: { name: string; price: number; who: number[] }[], receipt: number | null, tax: number, pct: number) {
  const lines: Line[][] = Array.from({ length: n }, () => []);
  const base = Array<number>(n).fill(0);
  let itemsSum = 0;
  for (const it of items) {
    itemsSum += it.price;
    const who = it.who.filter((w) => w < n);
    const sharers = who.length ? who : lines.map((_, i) => i);
    for (const w of sharers) {
      base[w] += it.price / sharers.length;
      lines[w].push({ name: it.name, ways: sharers.length, amount: it.price / sharers.length });
    }
  }
  const leftover = receipt === null ? 0 : receipt - itemsSum - tax;
  const shared = Math.max(0, leftover);
  const subs = base.map((b) => b + shared / n);
  const subtotal = itemsSum + shared;
  const tip = Math.round((subtotal * pct) / 100);
  // Tax and tip follow what each person ordered, so the salad doesn't pay tip on the steak.
  const extras = subs.map((s) => (subtotal > 0 ? ((tax + tip) * s) / subtotal : (tax + tip) / n));
  const total = subtotal + tax + tip;
  return { lines, shared, extras, itemsSum, leftover, tip, total, shares: allocate(subs.map((s, i) => s + extras[i]), total) };
}

/* ---------- UI bits ---------- */

const chip = (on: boolean) =>
  `px-2.5 py-0.5 rounded-full text-xs border transition ${on ? "bg-[var(--color-accent)] border-[var(--color-accent)] text-black font-medium" : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-white"}`;

function MoneyInput({ value, onChange, symbol, placeholder, className = "", big = false, ...rest }: { value: string; onChange: (v: string) => void; symbol: string; placeholder?: string; className?: string; big?: boolean; "aria-label"?: string; onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void }) {
  const bad = value.trim() !== "" && parseAmount(value) === null;
  return (
    <label className={`relative block ${className}`}>
      <span className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 ${big ? "text-lg" : "text-sm"}`}>{symbol}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="decimal"
        placeholder={placeholder ?? "0.00"}
        className={`${fieldCls} w-full text-right ${big ? "text-2xl py-3" : ""} ${bad ? "!border-red-800" : ""}`}
        style={{ paddingLeft: `${0.75 + symbol.length * (big ? 0.75 : 0.55)}rem` }}
        {...rest}
      />
    </label>
  );
}

function TipPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Segmented label="Tip" size="sm" options={TIPS.map((t) => ({ value: t, label: `${t}%` }))} value={value} onChange={onChange} />
      <label className="flex items-center gap-1 text-xs text-[var(--color-muted)]">
        <input value={value} onChange={(e) => onChange(e.target.value)} inputMode="decimal" aria-label="Custom tip percent" className={`${fieldCls} w-16 py-1 text-right`} />%
      </label>
    </div>
  );
}

function Row({ label, value, strong = false }: { label: ReactNode; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? "text-white font-medium" : "text-[var(--color-muted)]"}`}>
      <span className="min-w-0 truncate">{label}</span>
      <span className="font-mono tabular-nums shrink-0">{value}</span>
    </div>
  );
}

/* ---------- tool ---------- */

export default function SplitTool() {
  const params = useHashParams();
  const [storedCur, setStoredCur] = useStored("veyth:split:currency", "EUR");
  const [cur, setCurState] = useState(() => { const c = params.get("cur"); return c && CURRENCIES.includes(c) ? c : storedCur; });
  const [mode, setMode] = useState<Mode>(() => (params.get("m") === "items" ? "items" : "simple"));
  const [bill, setBill] = useState(() => params.get("t") ?? "96.40");
  const [tip, setTip] = useState(() => params.get("tip") ?? "10");
  const [roundUp, setRoundUp] = useState(() => params.get("up") === "1");
  const [tax, setTax] = useState(() => params.get("tax") ?? "");
  const [people, setPeople] = useState(() => readPeople(params));
  const [items, setItems] = useState(() => readItems(params));
  const [paid, setPaid] = useState(() => parseInt(params.get("paid") ?? "") || 0);
  const [focusId, setFocusId] = useState<number | null>(null);

  const setCur = (c: string) => { setCurState(c); setStoredCur(c); };

  const fmt = useMemo(() => new Intl.NumberFormat(undefined, { style: "currency", currency: cur }), [cur]);
  const unit = 10 ** (fmt.resolvedOptions().maximumFractionDigits ?? 2);
  const symbol = fmt.formatToParts(0).find((p) => p.type === "currency")?.value ?? cur;
  const money = (minor: number) => fmt.format(Math.round(minor) / unit);
  const toMinor = (s: string) => { const v = parseAmount(s); return v === null ? null : Math.round(v * unit); };

  const n = people.length;
  const payer = paid < n ? paid : 0;
  const pct = Math.min(100, parseAmount(tip) ?? 0);
  const billMinor = toMinor(bill);
  const taxMinor = toMinor(tax) ?? 0;

  const simple = useMemo(() => (billMinor === null ? null : simpleSplit(billMinor, n, pct, roundUp, unit)), [billMinor, n, pct, roundUp, unit]);
  const itemised = useMemo(
    () => itemSplit(n, items.flatMap((it) => { const p = toMinor(it.price); return p === null ? [] : [{ name: it.name.trim() || "Item", price: p, who: it.who }]; }), billMinor, taxMinor, pct),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toMinor only depends on unit
    [n, items, billMinor, taxMinor, pct, unit],
  );

  /* people & items */

  function resizePeople(count: number) {
    const c = Math.min(MAX_PEOPLE, Math.max(1, count));
    setPeople((p) => (c <= p.length ? p.slice(0, c) : [...p, ...Array.from({ length: c - p.length }, (_, k) => defaultName(p.length + k))]));
  }
  function renamePerson(i: number, name: string) {
    setPeople((p) => p.map((x, j) => (j === i ? name : x)));
  }
  function removePerson(i: number) {
    if (n <= 1) return;
    setPeople((p) => p.filter((_, j) => j !== i));
    setItems((its) => its.map((it) => ({ ...it, who: it.who.filter((w) => w !== i).map((w) => (w > i ? w - 1 : w)) })));
    setPaid((p) => (p === i ? 0 : p > i ? p - 1 : p));
  }
  function updateItem(id: number, patch: Partial<Item>) {
    setItems((its) => its.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }
  function toggleWho(it: Item, i: number) {
    updateItem(it.id, { who: it.who.includes(i) ? it.who.filter((w) => w !== i) : [...it.who, i].sort((a, b) => a - b) });
  }
  function addItem() {
    const it = newItem();
    setItems((its) => [...its, it]);
    setFocusId(it.id);
  }

  const name = (i: number) => people[i]?.trim() || defaultName(i);

  /* summary for the group chat */

  const tipLine = (t: number) => (pct || roundUp ? ` + tip ${money(t)}` : "");
  const summary = mode === "simple"
    ? simple
      ? [
          `Bill ${money(billMinor!)}${tipLine(simple.tip)} = ${money(simple.total)}`,
          `Split ${n} ways: ${[...new Set(simple.shares)].sort((a, b) => b - a).map(money).join(" / ")} each`,
        ].join("\n")
      : ""
    : [
        ...itemised.shares.map((s, i) => `${name(i)}: ${money(s)}`),
        `Total ${money(itemised.total)}${itemised.tip ? ` (incl. ${money(itemised.tip)} tip)` : ""}`,
        "",
        ...itemised.shares.flatMap((s, i) => (i === payer || !s ? [] : [`${name(i)} owes ${name(payer)} ${money(s)}`])),
      ].join("\n").trim();

  const share: Record<string, string> = { m: mode, cur, t: bill, tip };
  if (mode === "simple") {
    share.n = String(n);
    if (roundUp) share.up = "1";
  } else {
    share.ppl = JSON.stringify(people);
    share.it = JSON.stringify(items.filter((it) => it.name || it.price).map((it) => [it.name, it.price, it.who]));
    if (tax) share.tax = tax;
    share.paid = String(payer);
  }

  /* status */

  let status: ReactNode;
  if (mode === "simple") {
    status = bill.trim() === "" ? (
      <VeyStatus mood="idle">Enter the bill amount — shares update as you type.</VeyStatus>
    ) : !simple ? (
      <VeyStatus mood="oops">Can't read “{bill}” as an amount.</VeyStatus>
    ) : (
      <VeyStatus mood="happy">Split {n} {n === 1 ? "way" : "ways"} · shares add up to exactly {money(simple.total)}</VeyStatus>
    );
  } else {
    const over = billMinor !== null && itemised.leftover < 0;
    status = over ? (
      <VeyStatus mood="oops">Items{taxMinor ? " and tax" : ""} add up to {money(itemised.itemsSum + taxMinor)} — more than the {money(billMinor!)} receipt total. Check the prices or the total.</VeyStatus>
    ) : itemised.shared > 0 ? (
      <VeyStatus mood="happy">{money(itemised.shared)} of the receipt isn't assigned to anyone, so it's split evenly as “shared”.</VeyStatus>
    ) : (
      <VeyStatus mood="happy">Everything is itemised · shares add up to exactly {money(itemised.total)}</VeyStatus>
    );
  }

  return (
    <div className="space-y-4">
      <ToolHeader>
        <CopyButton text={summary} label="Copy summary" />
        <ShareButton params={share} />
      </ToolHeader>

      <div className="flex flex-wrap gap-x-5 gap-y-3 items-center">
        <Segmented
          label="Split"
          options={[
            { value: "simple", label: "Evenly", title: "Divide the bill equally" },
            { value: "items", label: "By item", title: "Everyone pays for what they had" },
          ]}
          value={mode}
          onChange={setMode}
        />
        <label className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
          Currency
          <select value={cur} onChange={(e) => setCur(e.target.value)} className={`${fieldCls} py-1`}>
            {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
      </div>

      {status}

      {mode === "simple" ? (
        <div className="grid md:grid-cols-2 gap-6 items-start">
          <div className="space-y-5">
            <Panel label="Bill amount">
              <MoneyInput value={bill} onChange={setBill} symbol={symbol} big aria-label="Bill amount" />
            </Panel>
            <Panel label="People">
              <div className="flex items-center gap-3">
                <button className={`${btn} w-10 h-10 !p-0 text-lg`} onClick={() => resizePeople(n - 1)} disabled={n <= 1} aria-label="One fewer person">−</button>
                <input
                  value={n}
                  onChange={(e) => resizePeople(parseInt(e.target.value) || 1)}
                  inputMode="numeric"
                  aria-label="Number of people"
                  className={`${fieldCls} w-16 text-center text-lg`}
                />
                <button className={`${btn} w-10 h-10 !p-0 text-lg`} onClick={() => resizePeople(n + 1)} disabled={n >= MAX_PEOPLE} aria-label="One more person">+</button>
              </div>
            </Panel>
            <div className="space-y-3">
              <TipPicker value={tip} onChange={setTip} />
              <Toggle checked={roundUp} onChange={setRoundUp} title="Each share goes up to a whole amount; the extra becomes tip">
                Round each share up
              </Toggle>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-4">
            {simple ? (
              <>
                <div>
                  <div className="text-xs font-mono uppercase tracking-wide text-[var(--color-muted)]">Each person pays</div>
                  <div className="text-4xl font-bold font-mono tabular-nums text-[var(--color-accent)] break-all">{money(Math.max(...simple.shares))}</div>
                  {new Set(simple.shares).size > 1 && (
                    <p className="mt-1 text-xs text-[var(--color-muted)]">
                      {simple.shares.filter((s) => s === simple.shares[0]).length} pay {money(simple.shares[0])} and {simple.shares.filter((s) => s !== simple.shares[0]).length} pay {money(simple.shares[n - 1])}, so it adds up to the exact total.
                    </p>
                  )}
                </div>
                <div className="space-y-1 text-sm border-t border-[var(--color-border)] pt-3">
                  <Row label="Bill" value={money(billMinor!)} />
                  <Row label={`Tip${roundUp && billMinor ? ` (${Math.round((simple.tip / billMinor) * 1000) / 10}% after rounding)` : pct ? ` (${pct}%)` : ""}`} value={money(simple.tip)} />
                  <Row label="Total" value={money(simple.total)} strong />
                </div>
                {n > 1 && (
                  <p className="text-xs text-[var(--color-muted)]">Whoever paid collects {money(simple.total - simple.shares[n - 1])} from the other {n - 1}.</p>
                )}
              </>
            ) : (
              <p className="text-sm text-zinc-500">Shares appear here.</p>
            )}
          </div>
        </div>
      ) : (
        <div className="grid lg:grid-cols-[3fr_2fr] gap-6 items-start">
          <div className="space-y-5 min-w-0">
            <Panel label="People" meta={`${n}`} actions={<button className={btnSm} onClick={() => resizePeople(n + 1)} disabled={n >= MAX_PEOPLE}>+ Add person</button>}>
              <div className="flex flex-wrap gap-2">
                {people.map((p, i) => (
                  <div key={i} className="flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] pl-3 pr-1 focus-within:border-zinc-500">
                    <input
                      value={p}
                      onChange={(e) => renamePerson(i, e.target.value)}
                      aria-label={`Person ${i + 1} name`}
                      placeholder={defaultName(i)}
                      className="bg-transparent text-sm py-1 focus:outline-none"
                      style={{ width: `${Math.max(4, (p || defaultName(i)).length + 1)}ch` }}
                    />
                    <button onClick={() => removePerson(i)} disabled={n <= 1} aria-label={`Remove ${name(i)}`} className="h-6 w-6 rounded-full text-zinc-500 hover:text-white hover:bg-zinc-800 disabled:opacity-30">×</button>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel label="Items" meta="tap names to say who had it" actions={<button className={btnSm} onClick={() => setItems([])} disabled={!items.length}>Clear</button>}>
              <div className="space-y-2">
                {items.map((it, idx) => (
                  <div key={it.id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2 space-y-2">
                    <div className="flex gap-2">
                      <input
                        value={it.name}
                        onChange={(e) => updateItem(it.id, { name: e.target.value })}
                        placeholder="What was it?"
                        aria-label="Item name"
                        autoFocus={it.id === focusId}
                        className={`${fieldCls} font-sans flex-1 min-w-0`}
                      />
                      <MoneyInput
                        value={it.price}
                        onChange={(v) => updateItem(it.id, { price: v })}
                        symbol={symbol}
                        className="w-28 shrink-0"
                        aria-label="Item price"
                        onKeyDown={(e) => { if (e.key === "Enter" && idx === items.length - 1) addItem(); }}
                      />
                      <button onClick={() => setItems((its) => its.filter((x) => x.id !== it.id))} aria-label="Remove item" className="w-8 shrink-0 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800">×</button>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <button className={chip(!it.who.filter((w) => w < n).length)} onClick={() => updateItem(it.id, { who: [] })}>Everyone</button>
                      {people.map((_, i) => (
                        <button key={i} className={chip(it.who.includes(i))} onClick={() => toggleWho(it, i)} aria-pressed={it.who.includes(i)}>{name(i)}</button>
                      ))}
                    </div>
                  </div>
                ))}
                <button className={`${btn} w-full border-dashed`} onClick={addItem}>+ Add item</button>
              </div>
            </Panel>

            <div className="grid sm:grid-cols-2 gap-4">
              <Panel label="Receipt total" meta="before tip, optional">
                <MoneyInput value={bill} onChange={setBill} symbol={symbol} placeholder="Anything not itemised is shared" aria-label="Receipt total" />
              </Panel>
              <Panel label="Tax / service" meta="if added on top">
                <MoneyInput value={tax} onChange={setTax} symbol={symbol} aria-label="Tax or service charge" />
              </Panel>
            </div>
            <TipPicker value={tip} onChange={setTip} />
          </div>

          <div className="space-y-3 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-mono text-[var(--color-muted)] uppercase tracking-wide">Who owes what</div>
              <label className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
                Paid by
                <select value={payer} onChange={(e) => setPaid(+e.target.value)} className={`${fieldCls} py-1 font-sans`}>
                  {people.map((_, i) => <option key={i} value={i}>{name(i)}</option>)}
                </select>
              </label>
            </div>
            {itemised.shares.map((s, i) => (
              <div key={i} className={`rounded-2xl border p-4 space-y-2 ${i === payer ? "border-[var(--color-accent)]/40" : "border-[var(--color-border)]"} bg-[var(--color-surface)]`}>
                <div className="flex items-baseline justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{name(i)}</div>
                    <div className="text-xs text-[var(--color-muted)]">
                      {i === payer ? "paid the bill" : s ? <>owes <span className="text-white">{name(payer)}</span></> : "owes nothing"}
                    </div>
                  </div>
                  <div className="text-2xl font-bold font-mono tabular-nums text-[var(--color-accent)]">{money(s)}</div>
                </div>
                <details className="text-xs">
                  <summary className="cursor-pointer text-zinc-500 hover:text-white">Breakdown</summary>
                  <div className="mt-2 space-y-0.5">
                    {itemised.lines[i].map((l, k) => <Row key={k} label={`${l.name}${l.ways > 1 ? ` ÷${l.ways}` : ""}`} value={money(l.amount)} />)}
                    {itemised.shared > 0 && <Row label="Shared (not itemised)" value={money(itemised.shared / n)} />}
                    {itemised.extras[i] > 0 && <Row label={taxMinor ? "Tax & tip" : "Tip"} value={money(itemised.extras[i])} />}
                  </div>
                </details>
              </div>
            ))}
            <div className="rounded-2xl border border-[var(--color-border)] p-4 space-y-1 text-sm">
              <Row label="Items" value={money(itemised.itemsSum)} />
              {itemised.shared > 0 && <Row label="Not itemised" value={money(itemised.shared)} />}
              {taxMinor > 0 && <Row label="Tax / service" value={money(taxMinor)} />}
              <Row label={`Tip${pct ? ` (${pct}%)` : ""}`} value={money(itemised.tip)} />
              <Row label="Total" value={money(itemised.total)} strong />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
