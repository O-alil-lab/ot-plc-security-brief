import Link from "next/link";
import type { InboxStatus, Prisma } from "@prisma/client";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth/session";
import { Flash, type FlashParams } from "@/components/admin/Flash";
import { Csrf } from "@/components/admin/Csrf";
import { PageTitle, Empty, ago } from "@/components/admin/ui";
import { DemoBadge } from "@/components/Lamp";
import { createStoryAction, investigateItemsAction, rejectItemsAction, restoreItemsAction, groupItemsAction } from "../../actions";

export const metadata: Metadata = { title: "Inbox" };
const PAGE = 40;
const STATUSES: InboxStatus[] = ["new", "investigating", "rejected", "used", "archived"];

export default async function InboxPage({ searchParams }: { searchParams: FlashParams }) {
  await requireAdminPage();
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : (sp[k] as string | undefined))?.trim() || undefined;
  const status = (STATUSES.includes(one("status") as InboxStatus) ? one("status") : "new") as InboxStatus;
  const q = one("q");
  const sourceId = one("source");
  const minScore = Number(one("min") ?? 0) || 0;
  const sort = one("sort") === "recent" ? "recent" : "relevance";
  const page = Math.max(1, Number(one("page") ?? 1) || 1);

  const where: Prisma.CollectedItemWhereInput = {
    inboxStatus: status,
    ...(sourceId ? { sourceId } : {}),
    ...(minScore ? { relevanceScore: { gte: minScore } } : {}),
    ...(q
      ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { excerpt: { contains: q, mode: "insensitive" } }, { extractedIds: { has: q.toUpperCase() } }] }
      : {}),
  };
  const [items, total, sources] = await Promise.all([
    prisma.collectedItem.findMany({
      where,
      include: { source: { select: { name: true, trustLevel: true } }, duplicateGroup: { include: { _count: { select: { items: true } } } }, _count: { select: { revisions: true } } },
      orderBy: sort === "recent" ? [{ collectedAt: "desc" }] : [{ relevanceScore: "desc" }, { publishedAt: "desc" }],
      skip: (page - 1) * PAGE,
      take: PAGE,
    }),
    prisma.collectedItem.count({ where }),
    prisma.source.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const qs = (patch: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    const merged = { status, q, source: sourceId, min: minScore || undefined, sort, page, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v !== undefined && v !== "" && !(k === "page" && v === 1)) p.set(k, String(v));
    return `/admin/inbox?${p}`;
  };
  const returnTo = qs({});

  return (
    <>
      <Flash msg={sp.msg} error={sp.error} />
      <PageTitle title="Inbox" />
      <p className="-mt-3 mb-5 max-w-[70ch] text-sm text-slate">
        Collected items wait here for review. Nothing is published from the inbox: create a draft story, write it from the sources, then approve and publish it.
        Relevance is a triage aid, not severity.
      </p>

      <nav aria-label="Inbox status" className="mb-4 flex flex-wrap gap-2 text-sm">
        {STATUSES.map((s) => (
          <Link key={s} href={qs({ status: s, page: 1 })} aria-current={s === status ? "page" : undefined} className={`rounded-full border px-3 py-1 no-underline ${s === status ? "border-teal bg-teal text-white hover:text-white" : "border-line text-ink"}`}>
            {s === "used" ? "Used in stories" : s === "archived" ? "Older backlog" : s[0].toUpperCase() + s.slice(1)}
          </Link>
        ))}
      </nav>

      <form method="get" className="mb-5 flex flex-wrap items-end gap-3 text-sm">
        <input type="hidden" name="status" value={status} />
        <label>
          <span className="mb-1 block">Search</span>
          <input name="q" defaultValue={q} placeholder="Title, excerpt or CVE" className="field w-56" />
        </label>
        <label>
          <span className="mb-1 block">Source</span>
          <select name="source" defaultValue={sourceId ?? ""} className="field w-52">
            <option value="">All sources</option>
            {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label>
          <span className="mb-1 block">Min. relevance</span>
          <input name="min" type="number" min={0} max={100} defaultValue={minScore || ""} className="field w-24" />
        </label>
        <label>
          <span className="mb-1 block">Sort</span>
          <select name="sort" defaultValue={sort} className="field w-36">
            <option value="relevance">Relevance</option>
            <option value="recent">Recently collected</option>
          </select>
        </label>
        <button className="btn btn-secondary">Filter</button>
      </form>

      {items.length === 0 ? (
        <Empty title={status === "new" ? "Inbox zero." : "No items here."}>
          {status === "new" ? <>New items arrive when the worker fetches sources. You can also <Link href="/admin/sources">fetch a source now</Link>.</> : null}
        </Empty>
      ) : (
        <form>
          <Csrf />
          <input type="hidden" name="returnTo" value={returnTo} />
          <div className="sticky top-0 z-10 -mx-1 mb-2 flex flex-wrap items-center gap-2 bg-white px-1 py-2 text-sm">
            <span className="text-slate">With selected:</span>
            <button formAction={createStoryAction} className="btn btn-primary">Create draft story</button>
            <button formAction={investigateItemsAction} className="btn btn-secondary">Investigate</button>
            <button formAction={groupItemsAction} className="btn btn-secondary">Group as duplicates</button>
            <button formAction={rejectItemsAction} className="btn btn-danger">Reject</button>
            {status !== "new" && <button formAction={restoreItemsAction} className="btn btn-secondary">Back to new</button>}
          </div>
          <table className="w-full text-sm">
            <caption className="sr-only">Collected items</caption>
            <thead className="border-b border-line text-left text-slate">
              <tr>
                <th className="w-8 py-2"><span className="sr-only">Select</span></th>
                <th className="w-16 py-2">Score</th>
                <th className="py-2">Item</th>
                <th className="hidden w-40 py-2 md:table-cell">Published</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className="border-b border-line align-top">
                  <td className="py-3"><input type="checkbox" name="itemId" value={i.id} aria-label={`Select ${i.title}`} className="accent-teal" /></td>
                  <td className="py-3">
                    <span className={`inline-block min-w-9 rounded px-1.5 py-0.5 text-center font-semibold ${i.relevanceScore >= 50 ? "bg-teal text-white" : i.relevanceScore >= 30 ? "bg-teal/15 text-ink" : "bg-panel text-slate"}`} title="Relevance (triage aid, not severity)">
                      {i.relevanceScore}
                    </span>
                  </td>
                  <td className="py-3 pr-3">
                    <Link href={`/admin/inbox/${i.id}`} className="font-medium text-ink">{i.title}</Link>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate">
                      <span>{i.source.name}</span>
                      {i.isDemo && <DemoBadge />}
                      {i.source.trustLevel === "social" && <span className="font-semibold text-lamp-amber">Social — unverified</span>}
                      {i.duplicateGroup && <span>Duplicate group of {i.duplicateGroup._count.items} ({i.duplicateGroup.reason})</span>}
                      {i.suggestedGroupIds.length > 0 && <span>Shares IDs with {i.suggestedGroupIds.length} other item(s)</span>}
                      {i._count.revisions > 0 && <span className="font-semibold text-lamp-amber">Updated by source</span>}
                      {i.extractedIds.slice(0, 3).map((id) => <span key={id} className="rounded border border-line px-1">{id}</span>)}
                      {i.url && <a href={i.url} target="_blank" rel="noopener noreferrer nofollow">Original</a>}
                    </div>
                  </td>
                  <td className="hidden py-3 text-slate md:table-cell">{i.publishedAt ? ago(i.publishedAt) : "Unknown"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </form>
      )}
      {pages > 1 && (
        <nav aria-label="Pagination" className="mt-4 flex justify-between text-sm">
          {page > 1 ? <Link href={qs({ page: page - 1 })}>Previous</Link> : <span />}
          <span className="text-slate">Page {page} of {pages} ({total} items)</span>
          {page < pages ? <Link href={qs({ page: page + 1 })}>Next</Link> : <span />}
        </nav>
      )}
    </>
  );
}
