import Link from "next/link";
import { prisma } from "@/lib/db";
import { StoryRow } from "@/components/StoryRow";
import { SignupForm } from "@/components/SignupForm";
import { VerificationLamp } from "@/components/Lamp";
import { categoryLabel, fmtDate } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [stories, categories, issues] = await Promise.all([
    prisma.story.findMany({
      where: { editorialStatus: "published" },
      include: { sources: { include: { item: { select: { publishedAt: true, url: true, source: { select: { name: true, trustLevel: true } } } } } } },
      orderBy: { publishedAt: "desc" },
      take: 6,
    }),
    prisma.story.findMany({ where: { editorialStatus: "published" }, select: { categories: true } }),
    prisma.newsletterIssue.findMany({ where: { status: { in: ["sent", "partially_failed"] } }, orderBy: { number: "desc" }, take: 3 }),
  ]);
  const categoryCounts = new Map<string, number>();
  for (const s of categories) for (const c of s.categories) categoryCounts.set(c, (categoryCounts.get(c) ?? 0) + 1);

  return (
    <>
      <section className="border-b border-line bg-panel">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_22rem] lg:py-16">
          <div>
            <h1 className="max-w-[18ch] text-4xl font-bold sm:text-5xl">Industrial security news, checked against the source.</h1>
            <p className="mt-5 max-w-[60ch] text-lg text-slate">
              A weekly briefing for PLC and automation engineers, ICS security analysts and asset owners. Each story names the affected products, explains why it matters on the plant floor, and links to the original advisory.
            </p>
          </div>
          <div className="rounded-lg border border-line bg-white p-5">
            <h2 className="text-xl font-semibold">Get the weekly brief</h2>
            <p className="mb-4 mt-1 text-sm text-slate">One email a week. Every story links to the original advisory; stories labelled “Auto-generated” are written automatically and not editor-reviewed.</p>
            <SignupForm compact />
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_18rem]">
        <section aria-labelledby="latest">
          <div className="mb-2 flex items-baseline justify-between gap-4">
            <h2 id="latest" className="text-2xl font-semibold">Latest stories</h2>
            <Link href="/feed" className="text-sm">All stories</Link>
          </div>
          {stories.length === 0 ? (
            <p className="border-t border-line py-8 text-slate">No stories have been published yet.</p>
          ) : (
            stories.map((s) => <StoryRow key={s.id} story={s} />)
          )}
        </section>

        <aside className="space-y-10">
          <section aria-labelledby="verify">
            <h2 id="verify" className="text-lg font-semibold">How we label stories</h2>
            <ul className="mt-3 space-y-3 text-sm">
              <li><VerificationLamp status="verified_primary" /><p className="mt-1 text-slate">Checked against a vendor or government CERT advisory.</p></li>
              <li><VerificationLamp status="partially_verified" /><p className="mt-1 text-slate">Some facts confirmed; the rest are marked as unknown.</p></li>
              <li><VerificationLamp status="unverified" /><p className="mt-1 text-slate">Reported by others and not yet confirmed. Treat with care.</p></li>
            </ul>
            <Link href="/about" className="mt-3 inline-block text-sm">Read our editorial standards</Link>
          </section>

          {categoryCounts.size > 0 && (
            <section aria-labelledby="topics">
              <h2 id="topics" className="text-lg font-semibold">Browse by topic</h2>
              <ul className="mt-3 space-y-1 text-sm">
                {[...categoryCounts.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => (
                  <li key={c}>
                    <Link href={`/feed?category=${encodeURIComponent(c)}`}>{categoryLabel(c)}</Link> <span className="text-slate">({n})</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="past">
            <h2 id="past" className="text-lg font-semibold">Past issues</h2>
            {issues.length ? (
              <ul className="mt-3 space-y-1 text-sm">
                {issues.map((i) => (
                  <li key={i.id}><Link href={`/newsletter/${i.number}`}>#{i.number}: {i.title}</Link> <span className="text-slate">{fmtDate(i.publishedAt)}</span></li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-slate">The first issue hasn&apos;t gone out yet.</p>
            )}
            <Link href="/newsletter" className="mt-2 inline-block text-sm">Newsletter archive</Link>
          </section>

          <section aria-labelledby="community" className="rounded-lg bg-panel p-4">
            <h2 id="community" className="text-lg font-semibold">Seen something we missed?</h2>
            <p className="mt-1 text-sm text-slate">Send us a link to an advisory, incident report or research. An editor reviews every submission.</p>
            <Link href="/submit" className="btn btn-secondary mt-3">Submit a story</Link>
          </section>
        </aside>
      </div>

      <section className="border-t border-line bg-ink text-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-3">
          <h2 className="text-2xl font-semibold">Why this brief exists</h2>
          <p className="text-slate-200 md:col-span-2 md:max-w-[62ch]">
            Industrial advisories are scattered across vendor portals, government CERTs and research blogs. Most security news is written for IT. We collect the industrial ones, check them against the primary source, and say plainly what is confirmed and what is not, so engineers can decide what to look at during their next maintenance window.
          </p>
        </div>
      </section>
    </>
  );
}
