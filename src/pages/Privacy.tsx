import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { SITE } from "../tools";
import { AD_CLIENT, REPO_URL, TIP_URL } from "../lib/env";

const UPDATED = "27 September 2026";
const { name, country, email } = SITE.operator;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 space-y-3 text-sm leading-relaxed text-[var(--color-muted)] [&_strong]:text-white">
      <h2 className="font-semibold text-base text-white">{title}</h2>
      {children}
    </section>
  );
}

function Ext({ href, children }: { href: string; children: ReactNode }) {
  return <a href={href} target="_blank" rel="noopener" className="text-[var(--color-accent)] hover:underline">{children}</a>;
}

export default function Privacy() {
  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold">Privacy policy</h1>
        <p className="text-sm text-[var(--color-muted)]">Last updated {UPDATED}</p>
      </div>

      <Section title="The short version">
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>What you type into a tool stays in your browser.</strong> It's never uploaded, stored or seen by anyone.</li>
          <li>No cookies, no analytics, no accounts, no fingerprinting.</li>
          <li>The server keeps <strong>no access logs</strong> and doesn't record your IP address.</li>
          <li>If you support the site on Ko-fi, only the minimum needed to show the funding bar is kept, and your name appears only if you choose.</li>
        </ul>
      </Section>

      <Section title="Who is responsible">
        <p>
          veyth.eu is run by <strong>{name}</strong>, a private individual based in {country}, who is the data controller
          under the GDPR. For anything privacy-related, email <a href={`mailto:${email}`} className="text-[var(--color-accent)] hover:underline">{email}</a>.
        </p>
      </Section>

      <Section title="The tools">
        <p>
          Every tool (JSON, UUID &amp; hash, regex, encoders, JWT, images and any added later) runs entirely in your browser with JavaScript.
          Your input is never sent to the server or anywhere else. That includes tokens and keys you paste into the JWT decoder
          files you hash and images you resize or convert.
        </p>
        <p>
          Share links put a tool's state after the <code>#</code> in the URL. Browsers never send that part to the server, so a
          shared link reveals its contents only to the people you give it to. The JWT decoder never puts your token in the URL.
        </p>
      </Section>

      <Section title="Server and hosting">
        <p>
          The site is a set of static files served from a virtual server rented from{" "}
          <Ext href="https://www.hetzner.com/legal/privacy-policy">Hetzner Online GmbH</Ext> (Germany), located in their data centre
          in Finland. Hetzner acts as a processor under a data processing agreement (Art. 28 GDPR) and has no access to the
          site's content beyond running the machine. Your data stays in the EU. To deliver a page, the server has to
          receive your IP address and the usual request details from your browser (such as the page requested and your browser's
          user agent). These are used only to send the response and are <strong>not written to any log</strong>.
        </p>
        <p>
          If the server hits an internal error, a technical error message is kept temporarily in the system log so it can be fixed.
          Your IP address and request headers are stripped from those messages before they're written.
        </p>
      </Section>

      <Section title="Stored in your browser">
        <p>
          If you pin tools on the homepage with ★, the list of pinned tools is saved in your browser's <code>localStorage</code> under{" "}
          <code>veyth:pinned</code>. It never leaves your device and contains nothing about you. Clearing your site data removes it.
          No cookies are set.
        </p>
      </Section>

      {TIP_URL && (
        <Section title="Supporting on Ko-fi">
          <p>
            The "Support" links take you to <Ext href="https://ko-fi.com">Ko-fi</Ext>, which handles the payment under{" "}
            <Ext href="https://more.ko-fi.com/privacy">its own privacy policy</Ext>. veyth.eu never sees your card or payment details.
          </p>
          <p>When you support the site, Ko-fi notifies veyth.eu's server. From that notification the server keeps only:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>the type of payment (one-off or monthly), the amount in euro, the date, and Ko-fi's message ID (used to ignore duplicates);</li>
            <li>a one-way hashed key derived from your email, so that repeat monthly payments from the same person aren't double-counted. <strong>Your email itself is not stored</strong>;</li>
            <li>your name, <strong>only if you ticked "make public"</strong> on Ko-fi. It's then shown on the <Link to="/thanks" className="text-[var(--color-accent)] hover:underline">thanks page</Link>.</li>
          </ul>
          <p>
            Any message you write on Ko-fi is discarded. Records are deleted automatically after 400 days. The legal basis is
            legitimate interest (Art. 6(1)(f) GDPR) in showing honest funding figures. For the public name, it's your choice on Ko-fi,
            and you can ask for it to be removed at any time.
          </p>
        </Section>
      )}

      {AD_CLIENT && (
        <Section title="Advertising">
          <p>
            The footer may show a single ad from <Ext href="https://www.ethicalads.io">EthicalAds</Ext>, a privacy-focused ad network
            run by Read the Docs. It doesn't use cookies, doesn't track you across sites and doesn't build a profile of you. To show an
            ad, your browser contacts EthicalAds' server, which sees your IP address and user agent. EthicalAds uses these briefly to
            pick an ad for your country and to prevent fraud, as described in{" "}
            <Ext href="https://www.ethicalads.io/privacy-policy/">their privacy policy</Ext>. Ad blockers are fine.
          </p>
        </Section>
      )}

      <Section title="Links to other sites">
        <p>
          {REPO_URL ? <>"Suggest a tool", "view source" and contributor links go to GitHub. </> : null}
          Links to other websites{TIP_URL ? " (such as Ko-fi)" : ""} are only followed when you click them. Those sites have their own
          privacy policies. Nothing from them is loaded until you visit them.
        </p>
      </Section>

      <Section title="Your rights">
        <p>
          Under the GDPR you can ask to access, correct or delete personal data held about you, restrict or object to its use, and
          receive a copy of it. In practice the only personal data this site can hold is a Ko-fi supporter record. To find yours,
          email <a href={`mailto:${email}`} className="text-[var(--color-accent)] hover:underline">{email}</a> from the address you used on Ko-fi.
          It's matched against the hashed key and handled within one month.
        </p>
        <p>
          You can also complain to Ireland's <Ext href="https://www.dataprotection.ie">Data Protection Commission</Ext> or the
          supervisory authority where you live.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          If this policy changes, the date at the top changes with it.{" "}
          {REPO_URL && <>The full history is public in the <Ext href={`${REPO_URL}/commits/main/src/pages/Privacy.tsx`}>source repository</Ext>.</>}
        </p>
      </Section>
    </div>
  );
}
