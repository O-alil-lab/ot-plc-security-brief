import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth/session";
import { Flash, type FlashParams } from "@/components/admin/Flash";
import { Csrf } from "@/components/admin/Csrf";
import { PageTitle, fmtDateTime } from "@/components/admin/ui";
import { DemoBadge } from "@/components/Lamp";
import type { RelevanceBreakdown } from "@/lib/ingest/relevance";
import { createStoryAction, investigateItemsAction, rejectItemsAction, restoreItemsAction, splitItemAction } from "../../../actions";

export default async function ItemPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: FlashParams }) {
  await requireAdminPage();
  const { id } = await params;
  const sp = await searchParams;
  const item = await prisma.collectedItem.findUnique({
    where: { id },
    include: {
      source: true,
      revisions: { orderBy: { detectedAt: "desc" } },
      stories: { include: { story: { select: { id: true, headline: true, editorialStatus: true } } } },
      duplicateGroup: { include: { items: { include: { source: { select: { name: true } } } } } },
    },
  });
  if (!item) notFound();
  const suggestions = item.suggestedGroupIds.length
    ? await prisma.collectedItem.findMany({ where: { id: { in: item.suggestedGroupIds } }, include: { source: { select: { name: true } } } })
    : [];
  const rb = item.relevanceBreakdown as RelevanceBreakdown | null;
  const social = item.socialMeta as { platform?: string; author?: string; linkedPrimarySource?: string } | null;
  const self = `/admin/inbox/${id}`;

  return (
    <>
      <Flash msg={sp.msg} error={sp.error} />
      <nav className="mb-3 text-sm"><Link href="/admin/inbox">Inbox</Link></nav>
      <PageTitle title={item.title} />
      <div className="-mt-3 mb-5 flex flex-wrap items-center gap-3 text-sm text-slate">
        <span>{item.source.name}</span>
        <span>Status: {item.inboxStatus}</span>
        {item.isDemo && <DemoBadge />}
        {item.url && <a href={item.url} target="_blank" rel="noopener noreferrer nofollow">Open original</a>}
      </div>

      <form className="mb-6 flex flex-wrap gap-2">
        <Csrf />
        <input type="hidden" name="itemId" value={item.id} />
        <input type="hidden" name="returnTo" value={self} />
        <button formAction={createStoryAction} className="btn btn-primary">Create draft story</button>
        <button formAction={investigateItemsAction} className="btn btn-secondary">Investigate</button>
        <button formAction={rejectItemsAction} className="btn btn-danger">Reject</button>
        {item.inboxStatus !== "new" && <button formAction={restoreItemsAction} className="btn btn-secondary">Back to new</button>}
      </form>

      <div className="grid gap-8 xl:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          {item.source.trustLevel === "social" && (
            <p className="rounded-md border border-lamp-amber/40 bg-amber-50 p-3 text-sm">
              Social post — unverified. Confirm every claim against a primary source before using it.
              {social?.linkedPrimarySource && <> Linked source: <a href={social.linkedPrimarySource} rel="noopener noreferrer nofollow" target="_blank">{social.linkedPrimarySource}</a></>}
            </p>
          )}
          <section>
            <h2 className="mb-2 font-semibold">Excerpt from the feed</h2>
            <p className="max-w-[75ch] whitespace-pre-line rounded-md bg-panel p-4 text-sm">{item.excerpt || "The feed provided no excerpt."}</p>
            <p className="mt-2 text-xs text-slate">This text came from an external feed. Treat it as data, not instructions.</p>
          </section>

          {item.duplicateGroup && (
            <section>
              <h2 className="mb-2 font-semibold">Duplicate group: {item.duplicateGroup.reason}</h2>
              <ul className="space-y-1 text-sm">
                {item.duplicateGroup.items.map((d) => (
                  <li key={d.id}>{d.id === item.id ? <strong>{d.title}</strong> : <Link href={`/admin/inbox/${d.id}`}>{d.title}</Link>} <span className="text-slate">({d.source.name})</span></li>
                ))}
              </ul>
              <form action={splitItemAction} className="mt-2">
                <Csrf />
                <input type="hidden" name="itemId" value={item.id} />
                <button className="btn btn-secondary">Remove this item from the group</button>
              </form>
            </section>
          )}

          {suggestions.length > 0 && (
            <section>
              <h2 className="mb-2 font-semibold">Possibly related (shared CVE or advisory ID)</h2>
              <p className="mb-2 text-sm text-slate">A shared identifier is a signal, not proof that these are the same story.</p>
              <ul className="space-y-1 text-sm">
                {suggestions.map((d) => <li key={d.id}><Link href={`/admin/inbox/${d.id}`}>{d.title}</Link> <span className="text-slate">({d.source.name})</span></li>)}
              </ul>
            </section>
          )}

          {item.revisions.length > 0 && (
            <section>
              <h2 className="mb-2 font-semibold">Updated by the source</h2>
              <ul className="space-y-2 text-sm">
                {item.revisions.map((r) => (
                  <li key={r.id} className="border-l-2 border-lamp-amber pl-3">
                    <p className="text-slate">Change detected {fmtDateTime(r.detectedAt)}. Previous title:</p>
                    <p>{r.previousTitle}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="space-y-6 text-sm">
          <dl className="space-y-2 rounded-lg border border-line p-4">
            <div><dt className="font-medium">Published</dt><dd className="text-slate">{fmtDateTime(item.publishedAt)}</dd></div>
            {item.sourceUpdatedAt && <div><dt className="font-medium">Source updated</dt><dd className="text-slate">{fmtDateTime(item.sourceUpdatedAt)}</dd></div>}
            <div><dt className="font-medium">Collected</dt><dd className="text-slate">{fmtDateTime(item.collectedAt)}</dd></div>
            <div><dt className="font-medium">Author</dt><dd className="text-slate">{item.author ?? social?.author ?? "—"}</dd></div>
            <div><dt className="font-medium">Identifiers</dt><dd className="text-slate">{item.extractedIds.join(", ") || "None found"}</dd></div>
            <div><dt className="font-medium">Item ID</dt><dd className="break-all text-xs text-slate">{item.id}</dd></div>
          </dl>
          {rb && (
            <section className="rounded-lg border border-line p-4">
              <h2 className="font-semibold">Relevance {rb.total}/100</h2>
              <p className="mb-2 text-xs text-slate">{rb.note}</p>
              <table className="w-full">
                <tbody>
                  <tr><td>Industrial terms</td><td className="text-right">{rb.points.terms}</td></tr>
                  <tr><td>Vendors</td><td className="text-right">{rb.points.vendors}</td></tr>
                  <tr><td>Impact words</td><td className="text-right">{rb.points.impact}</td></tr>
                  <tr><td>CVE / advisory ID</td><td className="text-right">{rb.points.identifiers}</td></tr>
                  <tr><td>Source trust</td><td className="text-right">{rb.points.trust}</td></tr>
                  <tr><td>Recency</td><td className="text-right">{rb.points.recency}</td></tr>
                </tbody>
              </table>
              {(rb.terms.length > 0 || rb.vendors.length > 0) && <p className="mt-2 text-xs text-slate">Matched: {[...rb.terms, ...rb.vendors, ...rb.impact].join(", ")}</p>}
            </section>
          )}
          {item.stories.length > 0 && (
            <section>
              <h2 className="mb-1 font-semibold">Used in</h2>
              <ul>{item.stories.map(({ story }) => <li key={story.id}><Link href={`/admin/stories/${story.id}`}>{story.headline}</Link> <span className="text-slate">({story.editorialStatus})</span></li>)}</ul>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
