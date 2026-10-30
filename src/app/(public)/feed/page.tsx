import Link from "next/link";
import type { Metadata } from "next";
import type { VerificationStatus } from "@prisma/client";
import { publishedStories, feedFacets, categoryLabel, type FeedFilters } from "@/lib/queries";
import { StoryRow } from "@/components/StoryRow";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "News feed" };

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
const VERIFICATIONS: VerificationStatus[] = ["verified_primary", "partially_verified", "unverified"];

export default async function FeedPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const verification = one(sp.verification) as VerificationStatus | undefined;
  const filters: FeedFilters = {
    q: one(sp.q),
    category: one(sp.category),
    vendor: one(sp.vendor),
    product: one(sp.product),
    source: one(sp.source),
    verification: verification && VERIFICATIONS.includes(verification) ? verification : undefined,
    from: one(sp.from),
    to: one(sp.to),
    page: Number(one(sp.page) ?? 1) || 1,
  };
  const [{ stories, total, page, pages }, facets] = await Promise.all([publishedStories(filters), feedFacets()]);
  const active = Object.entries(filters).filter(([k, v]) => k !== "page" && v);

  const pageHref = (p: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v && k !== "page") params.set(k, String(v));
    if (p > 1) params.set("page", String(p));
    const s = params.toString();
    return s ? `/feed?${s}` : "/feed";
  };

  const select = (name: keyof FeedFilters, label: string, options: string[], fmt: (s: string) => string = (s) => s) => (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">{label}</span>
      <select name={name} defaultValue={(filters[name] as string) ?? ""} className="field">
        <option value="">Any</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {fmt(o)}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold">News feed</h1>
      <p className="mt-2 max-w-[60ch] text-slate">Every published story, newest first. Search by keyword, CVE or advisory ID.</p>

      <div className="mt-8 grid gap-10 lg:grid-cols-[16rem_1fr]">
        <form method="get" action="/feed" className="space-y-4" role="search" aria-label="Filter stories">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Search</span>
            <input name="q" defaultValue={filters.q} placeholder="e.g. SIMATIC or CVE-2026-…" className="field" />
          </label>
          {select("category", "Topic", facets.categories, categoryLabel)}
          {select("vendor", "Vendor", facets.vendors)}
          {select("product", "Product", facets.products)}
          {select("source", "Source", facets.sources)}
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Verification</span>
            <select name="verification" defaultValue={filters.verification ?? ""} className="field">
              <option value="">Any</option>
              <option value="verified_primary">Verified against primary source</option>
              <option value="partially_verified">Partially verified</option>
              <option value="unverified">Unverified</option>
            </select>
          </label>
          <fieldset className="grid grid-cols-2 gap-2 text-sm">
            <legend className="mb-1 font-medium">Published</legend>
            <label>
              <span className="sr-only">From</span>
              <input type="date" name="from" defaultValue={filters.from} className="field" aria-label="Published from" />
            </label>
            <label>
              <span className="sr-only">To</span>
              <input type="date" name="to" defaultValue={filters.to} className="field" aria-label="Published to" />
            </label>
          </fieldset>
          <div className="flex gap-2">
            <button className="btn btn-primary" type="submit">Apply filters</button>
            {active.length > 0 && <Link href="/feed" className="btn btn-secondary">Clear</Link>}
          </div>
        </form>

        <section aria-live="polite">
          <p className="mb-2 text-sm text-slate">
            {total} {total === 1 ? "story" : "stories"}
            {active.length > 0 && " match your filters"}
          </p>
          {stories.length === 0 ? (
            <div className="border-t border-line py-10">
              <p className="font-medium">No stories match these filters.</p>
              <p className="mt-1 text-sm text-slate">Try a broader search, or <Link href="/feed">clear all filters</Link>.</p>
            </div>
          ) : (
            stories.map((s) => <StoryRow key={s.id} story={s} />)
          )}
          {pages > 1 && (
            <nav aria-label="Pagination" className="mt-6 flex items-center justify-between border-t border-line pt-4 text-sm">
              {page > 1 ? <Link href={pageHref(page - 1)}>Newer stories</Link> : <span />}
              <span className="text-slate">Page {page} of {pages}</span>
              {page < pages ? <Link href={pageHref(page + 1)}>Older stories</Link> : <span />}
            </nav>
          )}
        </section>
      </div>
    </div>
  );
}
