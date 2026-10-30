import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth/session";
import { Flash, type FlashParams } from "@/components/admin/Flash";
import { Csrf } from "@/components/admin/Csrf";
import { PageTitle, Empty, ago } from "@/components/admin/ui";
import { createIssueAction } from "../../actions";

export const metadata: Metadata = { title: "Newsletter" };

const STATUS_LABEL = { draft: "Draft", reviewed: "Reviewed", sending: "Sending", sent: "Sent", partially_failed: "Partly failed" } as const;

export default async function NewsletterPage({ searchParams }: { searchParams: FlashParams }) {
  await requireAdminPage();
  const sp = await searchParams;
  const issues = await prisma.newsletterIssue.findMany({ orderBy: { number: "desc" }, include: { _count: { select: { stories: true, deliveries: true } } } });
  return (
    <>
      <Flash msg={sp.msg} error={sp.error} />
      <PageTitle title="Newsletter">
        <form action={createIssueAction}>
          <Csrf />
          <button className="btn btn-primary">New issue</button>
        </form>
      </PageTitle>
      {issues.length === 0 ? (
        <Empty title="No issues yet.">Publish a few stories, then create an issue from them.</Empty>
      ) : (
        <table className="w-full text-sm">
          <thead className="border-b border-line text-left text-slate">
            <tr><th className="py-2">Issue</th><th className="py-2">Status</th><th className="py-2">Stories</th><th className="py-2">Recipients</th><th className="py-2">Updated</th></tr>
          </thead>
          <tbody>
            {issues.map((i) => (
              <tr key={i.id} className="border-b border-line">
                <td className="py-3"><Link href={`/admin/newsletter/${i.id}`} className="font-medium">#{i.number}: {i.title}</Link></td>
                <td className="py-3">{STATUS_LABEL[i.status]}</td>
                <td className="py-3">{i._count.stories}</td>
                <td className="py-3">{i._count.deliveries || "—"}</td>
                <td className="py-3 text-slate">{ago(i.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
