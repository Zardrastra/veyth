import { Mascot } from "../components/Mascot";
import { FundingBar, KofiButton } from "../components/Funding";
import { TOOLS } from "../tools";
import people from "../data/people.json";
import { REPO_URL } from "../lib/env";
import { useLiveSupporters } from "../lib/live";

type Person = { name: string; url?: string; what?: string };

function Name({ p }: { p: Person }) {
  return p.url ? <a href={p.url} target="_blank" rel="noopener" className="text-[var(--color-accent)] hover:underline">{p.name}</a> : <span>{p.name}</span>;
}

export default function Thanks() {
  // Ko-fi supporters arrive via the webhook; people.json still holds anyone added by hand.
  const live = useLiveSupporters();
  const manual = people.supporters as Person[];
  const supporters = [...manual, ...live.filter((p) => !manual.some((m) => m.name.toLowerCase() === p.name.toLowerCase()))];
  // Tool authors from site.json are credited automatically, alongside anyone listed in people.json.
  const contributors: Person[] = [
    ...TOOLS.filter((t) => t.author).map((t) => ({ name: t.author!, url: t.authorUrl, what: t.title })),
    ...(people.contributors as Person[]),
  ];

  return (
    <div className="space-y-8 max-w-3xl">
      <div className="flex items-center gap-4">
        <Mascot size={64} mood="love" interactive />
        <div>
          <h1 className="text-3xl font-bold">Thank you</h1>
          <p className="text-sm text-[var(--color-muted)]">The people keeping veyth.eu online and growing.</p>
        </div>
      </div>

      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 space-y-4">
        <h2 className="font-semibold">Supporters</h2>
        {supporters.length ? (
          <ul className="flex flex-wrap gap-2">
            {supporters.map((p) => (
              <li key={p.name} className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1 text-sm"><Name p={p} /></li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[var(--color-muted)]">No one yet — your name could be first.</p>
        )}
        <FundingBar />
        <KofiButton label="Become a supporter on Ko-fi" />
      </section>

      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 space-y-4">
        <h2 className="font-semibold">Contributors</h2>
        <ul className="space-y-1 text-sm">
          {contributors.map((p) => (
            <li key={`${p.name}-${p.what}`}><Name p={p} />{p.what && <span className="text-[var(--color-muted)]"> — {p.what}</span>}</li>
          ))}
        </ul>
        {REPO_URL && (
          <p className="text-sm text-[var(--color-muted)]">
            Want to be here? <a href={`${REPO_URL}/blob/main/CONTRIBUTING.md`} target="_blank" rel="noopener" className="text-[var(--color-accent)] hover:underline">Add a tool or a regex pattern</a>.
          </p>
        )}
      </section>
    </div>
  );
}
