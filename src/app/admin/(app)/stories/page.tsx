import Link from "next/link";
import type { EditorialStatus } from "@prisma/client";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth/session";
import { Flash, type FlashParams } from "@/components/admin/Flash";
import { PageTitle, Empty, ago } from "@/components/admin/ui";
import { VerificationLamp, DemoBadge } from "@/components/Lamp";

export const metadata: Metadata = { title: "Stories" };
const STATUSES: EditorialStatus[] = ["draft", "approved", "published", "rejected"];

export default async function StoriesPage({ searchParams }: { searchParams: FlashParams }) {
  await requireAdminPage();
  const sp = await searchParams;
  const status = STATUSES.includes(sp.status as EditorialStatus) ? (sp.status as EditorialStatus) : undefined;
  const [stories, counts] = await Promise.all([
    prisma.story.findMany({ where: status ? { editorialStatus: status } : {}, orderBy: { updatedAt: "desc" }, take: 100, include: { _count: { select: { sources: true } } } }),
    prisma.story.groupBy({ by: ["editorialStatus"], _count: true }),
  ]);
  const count = (s: EditorialStatus) => counts.find((c) => c.editorialStatus === s)?._count ?? 0;

  return (
    <>
      <Flash msg={sp.msg} error={sp.error} />
      <PageTitle title="Stories" />
      <nav className="mb-5 flex flex-wrap gap-2 text-sm" aria-label="Filter by status">
        <Link href="/admin/stories" className={`rounded-full border px-3 py-1 no-underline ${!status ? "border-teal bg-teal text-white hover:text-white" : "border-line text-ink"}`}>All</Link>
        {STATUSES.map((s) => (
          <Link key={s} href={`/admin/stories?status=${s}`} className={`rounded-full border px-3 py-1 no-underline ${status === s ? "border-teal bg-teal text-white hover:text-white" : "border-line text-ink"}`}>
            {s[0].toUpperCase() + s.slice(1)} ({count(s)})
          </Link>
        ))}
      </nav>
      {stories.length === 0 ? (
        <Empty title="No stories yet.">Select items in the <Link href="/admin/inbox">inbox</Link> and choose “Create draft story”.</Empty>
      ) : (
        <table className="w-full text-sm">
          <thead className="border-b border-line text-left text-slate">
            <tr><th className="py-2">Headline</th><th className="py-2">Status</th><th className="hidden py-2 md:table-cell">Verification</th><th className="hidden py-2 sm:table-cell">Updated</th></tr>
          </thead>
          <tbody>
            {stories.map((s) => (
              <tr key={s.id} className="border-b border-line align-top">
                <td className="py-3 pr-3">
                  <Link href={`/admin/stories/${s.id}`} className="font-medium">{s.headline}</Link> {s.isDemo && <DemoBadge />}
                  <p className="text-xs text-slate">{s._count.sources} source{s._count.sources === 1 ? "" : "s"}{s.aiAssisted && " — AI-assisted draft"}</p>
                </td>
                <td className="py-3 capitalize">{s.editorialStatus}</td>
                <td className="hidden py-3 md:table-cell"><VerificationLamp status={s.verificationStatus} compact /></td>
                <td className="hidden py-3 text-slate sm:table-cell">{ago(s.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
