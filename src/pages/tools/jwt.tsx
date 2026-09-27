import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { base64Decode, base64ToBytes } from "../../lib/codec";
import { hashFor } from "../../lib/share";
import { CopyButton, PasteButton, Panel, Segmented, Toggle, ToolHeader, VeyStatus, btnSm, fieldCls } from "../../components/ui";
import { HighlightTextarea, JsonCode } from "../../components/code";

// Example token (HS256, secret "veyth") — safe to show.
const SAMPLE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IlZleSIsImlhdCI6MTc1ODk0MDAwMCwiZXhwIjo0MTAyNDQ0ODAwfQ.vaBqZyDXh_gIW4bTvfyWP_U0FUKA3J4n8wLyHOgbUbw";

const PART_COLORS = ["text-rose-300", "text-violet-300", "text-sky-300"];

type Decoded = { header: Record<string, unknown>; payload: Record<string, unknown>; signature: string; signingInput: string };

function clean(token: string) {
  return token.trim().replace(/^Bearer\s+/i, "");
}

function decode(token: string): Decoded {
  const parts = clean(token).split(".");
  if (parts.length === 5) throw new Error("This is an encrypted JWE (5 parts) — its payload can't be read without the private key");
  if (parts.length !== 3) throw new Error(`A JWT has 3 parts separated by dots — this has ${parts.length}`);
  const parse = (s: string, what: string) => {
    try {
      return JSON.parse(base64Decode(s));
    } catch {
      throw new Error(`The ${what} (part ${what === "header" ? 1 : 2}) isn't valid Base64URL-encoded JSON — is the token cut off?`);
    }
  };
  return { header: parse(parts[0], "header"), payload: parse(parts[1], "payload"), signature: parts[2], signingInput: `${parts[0]}.${parts[1]}` };
}

/** Current time in seconds, re-rendering every 30s so "expires in …" stays accurate. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now / 1000;
}

function relative(sec: number, now: number): string {
  const diff = (sec - now) * 1000;
  const abs = Math.abs(diff);
  const units: [number, string][] = [[31536000000, "year"], [86400000, "day"], [3600000, "hour"], [60000, "minute"], [1000, "second"]];
  for (const [ms, name] of units) {
    if (abs >= ms) {
      const n = Math.round(abs / ms);
      return diff > 0 ? `in ${n} ${name}${n > 1 ? "s" : ""}` : `${n} ${name}${n > 1 ? "s" : ""} ago`;
    }
  }
  return "now";
}

// ---------- explanations ----------

const CLAIMS: Record<string, string> = {
  iss: "Issuer — who created the token",
  sub: "Subject — who the token is about (usually a user ID)",
  aud: "Audience — who the token is meant for",
  exp: "Expires",
  nbf: "Not valid before",
  iat: "Issued at",
  auth_time: "User authenticated at",
  jti: "Token ID — unique, used to prevent replay",
  azp: "Authorized party (client ID)",
  scope: "Scopes granted",
  scp: "Scopes granted",
  roles: "Roles",
  groups: "Groups",
  sid: "Session ID",
  nonce: "Nonce (replay protection for OIDC)",
  name: "Full name",
  email: "Email",
  email_verified: "Email verified",
  preferred_username: "Username",
  tid: "Tenant ID",
  oid: "Object ID",
  client_id: "Client ID",
};
const TIME_CLAIMS = new Set(["exp", "nbf", "iat", "auth_time", "updated_at"]);

const HEADERS: Record<string, string> = { alg: "Signing algorithm", typ: "Token type", kid: "Key ID — which key signed it", cty: "Content type", jku: "JWK set URL", x5t: "Certificate thumbprint" };

const ALG_INFO: Record<string, string> = {
  HS256: "HMAC + SHA-256 (shared secret)",
  HS384: "HMAC + SHA-384 (shared secret)",
  HS512: "HMAC + SHA-512 (shared secret)",
  RS256: "RSA PKCS#1 v1.5 + SHA-256",
  RS384: "RSA PKCS#1 v1.5 + SHA-384",
  RS512: "RSA PKCS#1 v1.5 + SHA-512",
  PS256: "RSA-PSS + SHA-256",
  PS384: "RSA-PSS + SHA-384",
  PS512: "RSA-PSS + SHA-512",
  ES256: "ECDSA P-256 + SHA-256",
  ES384: "ECDSA P-384 + SHA-384",
  ES512: "ECDSA P-521 + SHA-512",
  EdDSA: "Ed25519",
  none: "⚠ Unsigned — anyone can forge this",
};

function formatValue(v: unknown): string {
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "object" && v !== null) return JSON.stringify(v);
  return String(v);
}

/** Header fields with a plain-English label, e.g. alg → "Signing algorithm · HMAC + SHA-256". */
function HeaderRows({ header }: { header: Record<string, unknown> }) {
  const rows = Object.entries(header).filter(([k]) => k in HEADERS);
  if (!rows.length) return null;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs pt-3 border-t border-[var(--color-border)]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-[var(--color-muted)]"><code className="text-zinc-300">{k}</code> {HEADERS[k]}</dt>
          <dd className="font-mono break-all">
            {formatValue(v)}
            {k === "alg" && typeof v === "string" && ALG_INFO[v] && <span className={v === "none" ? "text-red-300" : "text-zinc-500"}> · {ALG_INFO[v]}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

// ---------- verification ----------

type AlgSpec = { kind: "hmac" | "rsa" | "pss" | "ec"; hash: string; curve?: string; salt?: number };
const ALGS: Record<string, AlgSpec> = {
  HS256: { kind: "hmac", hash: "SHA-256" },
  HS384: { kind: "hmac", hash: "SHA-384" },
  HS512: { kind: "hmac", hash: "SHA-512" },
  RS256: { kind: "rsa", hash: "SHA-256" },
  RS384: { kind: "rsa", hash: "SHA-384" },
  RS512: { kind: "rsa", hash: "SHA-512" },
  PS256: { kind: "pss", hash: "SHA-256", salt: 32 },
  PS384: { kind: "pss", hash: "SHA-384", salt: 48 },
  PS512: { kind: "pss", hash: "SHA-512", salt: 64 },
  ES256: { kind: "ec", hash: "SHA-256", curve: "P-256" },
  ES384: { kind: "ec", hash: "SHA-384", curve: "P-384" },
  ES512: { kind: "ec", hash: "SHA-512", curve: "P-521" },
};

async function importPublicKey(text: string, spec: AlgSpec, kid: unknown): Promise<CryptoKey> {
  const params =
    spec.kind === "rsa" ? { name: "RSASSA-PKCS1-v1_5", hash: spec.hash }
    : spec.kind === "pss" ? { name: "RSA-PSS", hash: spec.hash }
    : { name: "ECDSA", namedCurve: spec.curve! };
  const t = text.trim();
  if (t.startsWith("{")) {
    let jwk = JSON.parse(t);
    // Accept a whole JWKS ({ keys: [...] }) and pick the key the token names.
    if (Array.isArray(jwk.keys)) jwk = jwk.keys.find((k: { kid?: string }) => k.kid === kid) ?? jwk.keys[0];
    if (!jwk) throw new Error("The JWK set is empty");
    // Only the public members matter; dropping d/key_ops/alg avoids "usage mismatch" rejections.
    const { kty, n, e, crv, x, y } = jwk;
    return crypto.subtle.importKey("jwk", { kty, n, e, crv, x, y }, params, false, ["verify"]);
  }
  if (/BEGIN CERTIFICATE/.test(t)) throw new Error("That's a certificate — paste its public key (-----BEGIN PUBLIC KEY-----) or a JWK instead");
  if (/BEGIN RSA PUBLIC KEY/.test(t)) throw new Error('PKCS#1 "RSA PUBLIC KEY" isn\'t supported by browsers — convert it to "PUBLIC KEY" (SPKI) or a JWK');
  if (/PRIVATE KEY/.test(t)) throw new Error("That's a private key — never paste those into websites. Use the public key");
  const body = t.replace(/-----[^-]+-----/g, "");
  return crypto.subtle.importKey("spki", base64ToBytes(body), params, false, ["verify"]);
}

async function verifyJwt(d: Decoded, key: string, secretIsB64: boolean): Promise<boolean> {
  const alg = String(d.header.alg);
  const spec = ALGS[alg];
  if (!spec) throw new Error(`Verifying ${alg} isn't supported here`);
  const data = new TextEncoder().encode(d.signingInput);
  const sig = base64ToBytes(d.signature);
  if (spec.kind === "hmac") {
    const raw = secretIsB64 ? base64ToBytes(key) : new TextEncoder().encode(key);
    const k = await crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: spec.hash }, false, ["verify"]);
    return crypto.subtle.verify("HMAC", k, sig, data);
  }
  const k = await importPublicKey(key, spec, d.header.kid);
  const params = spec.kind === "rsa" ? { name: "RSASSA-PKCS1-v1_5" } : spec.kind === "pss" ? { name: "RSA-PSS", saltLength: spec.salt! } : { name: "ECDSA", hash: spec.hash };
  return crypto.subtle.verify(params, k, sig, data);
}

type Verdict = { state: "idle" } | { state: "checking" } | { state: "valid" } | { state: "invalid" } | { state: "error"; message: string };

function VerifyCard({ decoded }: { decoded: Decoded }) {
  const alg = String(decoded.header.alg);
  const spec = ALGS[alg];
  const [key, setKey] = useState("");
  const [b64, setB64] = useState(false);
  const [show, setShow] = useState(false);
  // The last finished check, tagged with the inputs it ran on, so a stale result is never shown.
  const [checked, setChecked] = useState<{ input: string; verdict: Verdict } | null>(null);
  const input = `${b64}:${key}`;
  const active = !!key.trim() && !!spec;
  const verdict: Verdict = !active ? { state: "idle" } : checked?.input === input ? checked.verdict : { state: "checking" };

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    verifyJwt(decoded, key, b64).then(
      (ok) => !cancelled && setChecked({ input, verdict: { state: ok ? "valid" : "invalid" } }),
      (e) => !cancelled && setChecked({ input, verdict: { state: "error", message: (e as Error).message || "Couldn't read that key" } }),
    );
    return () => { cancelled = true; };
  }, [decoded, key, b64, active, input]);

  return (
    <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-3">
      <div className="text-xs font-mono text-[var(--color-muted)] uppercase tracking-wide">Verify signature</div>
      {alg === "none" ? (
        <p className="text-sm text-red-300">This token declares <code>alg: none</code> — it has no signature. Never accept it on a server.</p>
      ) : !spec ? (
        <p className="text-sm text-[var(--color-muted)]">Verifying <code>{alg}</code> isn't supported in the browser.</p>
      ) : (
        <>
          {spec.kind === "hmac" ? (
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  type={show ? "text" : "password"}
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder={`Shared secret for ${alg}`}
                  autoComplete="off"
                  spellCheck={false}
                  className={fieldCls + " flex-1 min-w-0 bg-black/30"}
                />
                <button className={btnSm} onClick={() => setShow((s) => !s)}>{show ? "Hide" : "Show"}</button>
              </div>
              <Toggle checked={b64} onChange={setB64}>Secret is Base64-encoded</Toggle>
            </div>
          ) : (
            <textarea
              value={key}
              onChange={(e) => setKey(e.target.value)}
              rows={5}
              spellCheck={false}
              placeholder={"Public key for " + alg + ":\n-----BEGIN PUBLIC KEY-----\n…\n-----END PUBLIC KEY-----\nor a JWK / JWKS JSON"}
              className="w-full rounded-xl bg-black/30 border border-[var(--color-border)] p-3 font-mono text-xs focus:outline-none focus:border-zinc-500 placeholder:text-zinc-600"
            />
          )}
          <div
            className={`rounded-lg px-3 py-2 text-sm ${
              verdict.state === "valid" ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
              : verdict.state === "invalid" || verdict.state === "error" ? "bg-red-950/40 text-red-300"
              : "bg-black/20 text-[var(--color-muted)]"
            }`}
            role="status"
          >
            {verdict.state === "valid" && "✓ Signature verified — this key signed the token and it hasn't been changed."}
            {verdict.state === "invalid" && "✗ Invalid signature — wrong key, or the token was modified."}
            {verdict.state === "error" && `✗ ${verdict.message}`}
            {verdict.state === "checking" && "Checking…"}
            {verdict.state === "idle" && (spec.kind === "hmac" ? "Enter the secret to check the signature." : "Paste the public key to check the signature.")}
          </div>
        </>
      )}
      <p className="text-xs text-zinc-600">Checked with Web Crypto in this tab. Keys and secrets are never saved, sent or put in the URL.</p>
    </section>
  );
}

// ---------- page ----------

export default function JwtTool() {
  // Deliberately NOT stored in the URL — tokens are credentials.
  const [token, setToken] = useState(SAMPLE);
  const [view, setView] = useState<"claims" | "json">("claims");

  const result = useMemo(() => {
    if (!token.trim()) return null;
    try {
      return { ok: true as const, ...decode(token) };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  }, [token]);

  // Colour each dot-separated part in place, preserving any "Bearer " prefix and whitespace.
  const highlight = useMemo(() => {
    const lead = token.match(/^\s*(Bearer\s+)?/i)![0];
    const parts = token.slice(lead.length).split(".");
    const out: ReactNode[] = [<span key="lead" className="text-zinc-500">{lead}</span>];
    parts.forEach((p, i) => {
      if (i) out.push(<span key={`d${i}`} className="text-zinc-500">.</span>);
      out.push(<span key={i} className={PART_COLORS[i] ?? "text-red-400"}>{p}</span>);
    });
    return out;
  }, [token]);

  const now = useNow();
  const exp = result?.ok && typeof result.payload.exp === "number" ? result.payload.exp : null;
  const nbf = result?.ok && typeof result.payload.nbf === "number" ? result.payload.nbf : null;

  return (
    <div className="space-y-4">
      <ToolHeader />

      <Panel
        label="Token"
        meta="paste a JWT — a leading “Bearer ” is fine"
        actions={
          <>
            <button className={btnSm} onClick={() => setToken(SAMPLE)}>Sample</button>
            <PasteButton onPaste={setToken} />
            <button className={btnSm} onClick={() => setToken("")} disabled={!token}>Clear</button>
          </>
        }
      >
        <HighlightTextarea value={token} onChange={setToken} highlight={highlight} breakAll className="h-[140px]" placeholder="eyJhbGciOi…" />
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
          <span><span className="text-rose-300">●</span> header</span>
          <span><span className="text-violet-300">●</span> payload</span>
          <span><span className="text-sky-300">●</span> signature</span>
          <span className="ml-auto">Tokens are never saved or put in the URL.</span>
        </div>
      </Panel>

      {!result ? (
        <VeyStatus mood="idle">Paste a JWT to decode it.</VeyStatus>
      ) : !result.ok ? (
        <VeyStatus mood="oops">{result.error}</VeyStatus>
      ) : exp !== null && exp < now ? (
        <VeyStatus mood="oops">Decoded — but this token <b>expired {relative(exp, now)}</b>.</VeyStatus>
      ) : nbf !== null && nbf > now ? (
        <VeyStatus mood="oops">Decoded — but it isn't valid yet (starts {relative(nbf, now)}).</VeyStatus>
      ) : (
        <VeyStatus mood="happy">
          Decoded · {String(result.header.alg ?? "no alg")}
          {exp !== null ? ` · expires ${relative(exp, now)}` : " · no expiry — valid forever"}. Decoding doesn't prove it's genuine — verify the signature below.
        </VeyStatus>
      )}

      {result?.ok && (
        <div className="grid md:grid-cols-2 gap-4 items-start">
          <div className="space-y-4 min-w-0">
            <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-mono uppercase tracking-wide text-rose-300">Header</div>
                <CopyButton text={JSON.stringify(result.header, null, 2)} small />
              </div>
              <JsonCode value={result.header} />
              <HeaderRows header={result.header} />
            </section>
            <VerifyCard key={result.signingInput + result.signature} decoded={result} />
          </div>

          <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-3 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-mono uppercase tracking-wide text-violet-300">Payload</div>
              <div className="flex flex-wrap gap-1.5">
                <Segmented size="sm" options={[{ value: "claims", label: "Explained" }, { value: "json", label: "JSON" }]} value={view} onChange={setView} />
                <Link to={`/json${hashFor({ in: JSON.stringify(result.payload, null, 2) })}`} className={btnSm}>Open in JSON →</Link>
                <CopyButton text={JSON.stringify(result.payload, null, 2)} small />
              </div>
            </div>
            {view === "json" ? (
              <JsonCode value={result.payload} />
            ) : (
              <PayloadExplained payload={result.payload} now={now} />
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function PayloadExplained({ payload, now }: { payload: Record<string, unknown>; now: number }) {
  const entries = Object.entries(payload);
  if (!entries.length) return <p className="text-sm text-zinc-600">Empty payload.</p>;
  return (
    <dl className="divide-y divide-[var(--color-border)] text-sm">
      {entries.map(([k, v]) => {
        const isTime = TIME_CLAIMS.has(k) && typeof v === "number";
        const tone = isTime && k === "exp" ? (v < now ? "text-red-300" : "text-[var(--color-accent)]") : isTime && k === "nbf" && v > now ? "text-amber-300" : "";
        return (
          <div key={k} className="py-2 grid grid-cols-[minmax(0,9rem)_1fr] gap-3">
            <dt className="min-w-0">
              <code className="text-sky-300 break-all">{k}</code>
              {CLAIMS[k] && <div className="text-xs text-zinc-500 leading-snug">{CLAIMS[k]}</div>}
            </dt>
            <dd className={`font-mono break-all min-w-0 ${tone}`}>
              {isTime ? (
                <>
                  {new Date((v as number) * 1000).toLocaleString()}
                  <div className="text-xs text-zinc-500">{relative(v as number, now)} · {v as number}</div>
                </>
              ) : typeof v === "object" && v !== null && !Array.isArray(v) ? (
                <JsonCode value={v} className="text-xs" />
              ) : (
                formatValue(v)
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
