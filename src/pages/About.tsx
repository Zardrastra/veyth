import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Mascot } from "../components/Mascot";
import { KofiButton } from "../components/Funding";
import { SITE, TOOLS } from "../tools";
import { REPO_URL, SUGGEST_URL, TIP_URL } from "../lib/env";

const { name, country, contact } = SITE.operator;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 space-y-3 text-sm leading-relaxed text-[var(--color-muted)] [&_strong]:text-white">
      <h2 className="font-semibold text-base text-white">{title}</h2>
      {children}
    </section>
  );
}

const link = "text-[var(--color-accent)] hover:underline";

const PROMISES = [
  ["No uploads", "Whatever you paste or drop in is processed on your device and never leaves it."],
  ["No cookies", "Not for tracking, not for consent banners, not at all."],
  ["No analytics", "No Google Analytics, no pixels, no fingerprinting. Page views aren't counted."],
  ["No access logs", "The server doesn't record who visited, from where or what they looked at."],
  ["No accounts", "Nothing to sign up for, nothing to log in to, no email list."],
  ["Open source", "Every tool is a single readable file, so you can check all of the above yourself."],
] as const;

export default function About() {
  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-4">
        <Mascot size={64} interactive />
        <div>
          <h1 className="text-3xl font-bold">About veyth.eu</h1>
          <p className="text-sm text-[var(--color-muted)]">Tiny tools, no tracking.</p>
        </div>
      </div>

      <Section title="Why it exists">
        <p>
          Most online developer tools want something in return: an upload to their server, a cookie banner, a tracking script, or a
          sign-up before you can format a bit of JSON. That's a bad deal when what you're pasting is an API response, a config file or a
          live auth token.
        </p>
        <p>
          veyth.eu is the opposite: a handful of small, fast tools that do one job well and <strong>never see your data</strong>. It runs
          on a single €8/month server in Finland, paid for by people who find it useful.
        </p>
      </Section>

      <Section title="Who's behind it">
        <p>
          Hi, I'm {name.split(" ")[0]}, a developer based in {country}. I kept pasting tokens and config into random websites and
          wondering where it all ended up, so I started building the tools I use every day, properly: quick to load, easy to use,
          and running entirely in the browser. veyth.eu is where they live.
        </p>
        <p>
          It's a one-person side project, not a company. Questions, ideas or bug reports? Email{" "}
          <a href={`mailto:${contact}`} className={link}>{contact}</a>
          {REPO_URL && <> or <a href={`${REPO_URL}/issues`} target="_blank" rel="noopener" className={link}>open an issue</a></>}.
        </p>
      </Section>

      <Section title="How it works">
        <p>
          The site is plain static files. When you open a tool, your browser downloads it once, and from then on everything happens
          on your device, using standard browser features such as the Web Crypto API for hashing and signature checks. There's no
          backend doing the work, so there's nothing to send your input to.
        </p>
        <p>
          Share links keep a tool's state after the <code>#</code> in the URL, a part browsers never send to the server. A new tool is
          added roughly once a month. There are {TOOLS.length} so far:{" "}
          {TOOLS.map((t, i) => (
            <span key={t.slug}>
              <Link to={t.path} className={link}>{t.nav}</Link>
              {i < TOOLS.length - 1 ? ", " : "."}
            </span>
          ))}
        </p>
        {REPO_URL && (
          <p>
            It's open source.{" "}
            {SUGGEST_URL && <><a href={SUGGEST_URL} target="_blank" rel="noopener" className={link}>Suggest a tool</a> (requests are ranked by 👍), or </>}
            <a href={`${REPO_URL}/blob/main/CONTRIBUTING.md`} target="_blank" rel="noopener" className={link}>build one yourself</a>. Contributors
            are credited on the tool they wrote and on the <Link to="/thanks" className={link}>thanks page</Link>.
          </p>
        )}
      </Section>

      <Section title="Promises">
        <ul className="grid gap-3 sm:grid-cols-2">
          {PROMISES.map(([title, text]) => (
            <li key={title} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
              <strong className="block">{title}</strong>
              {text}
            </li>
          ))}
        </ul>
        <p>
          The details are in the <Link to="/privacy" className={link}>privacy policy</Link>. If the site ever shows an ad, it'll be a single
          cookieless one from EthicalAds, never a tracking network.
        </p>
      </Section>

      {TIP_URL && (
        <div className="flex flex-wrap items-center gap-3">
          <KofiButton label="Help keep it running on Ko-fi" />
          <Link to="/thanks" className="text-sm text-[var(--color-muted)] hover:text-white">Who's helped so far →</Link>
        </div>
      )}
    </div>
  );
}
