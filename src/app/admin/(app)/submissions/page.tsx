import Link from "next/link";
import type { Metadata } from "next";
import type { SubmissionStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth/session";
import { Flash, type FlashParams } from "@/components/admin/Flash";
import { Csrf } from "@/components/admin/Csrf";
import { PageTitle, Empty, ago } from "@/components/admin/ui";
import { submissionAction } from "../../actions";

export const metadata: Metadata = { title: "Submissions" };
const STATUSES: SubmissionStatus[] = ["pending", "promoted", "rejected", "spam"];

export default async function SubmissionsPage({ searchParams }: { searchParams: FlashParams }) {
  await requireAdminPage();
  const sp = await searchParams;
  const status = STATUSES.includes(sp.status as SubmissionStatus) ? (sp.status as SubmissionStatus) : "pending";
  const subs = await prisma.submission.findMany({ where: { status }, orderBy: { createdAt: "desc" }, take: 100 });
  return (
    <>
      <Flash msg={sp.msg} error={sp.error} />
      <PageTitle title="Community submissions" />
      <p className="-mt-3 mb-5 max-w-[70ch] text-sm text-slate">Submissions are never shown publicly. Promote useful ones to the inbox, where they enter as unverified items.</p>
      <nav className="mb-5 flex flex-wrap gap-2 text-sm">
        {STATUSES.map((s) => (
          <Link key={s} href={`/admin/submissions?status=${s}`} className={`rounded-full border px-3 py-1 no-underline ${s === status ? "border-teal bg-teal text-white hover:text-white" : "border-line text-ink"}`}>{s[0].toUpperCase() + s.slice(1)}</Link>
        ))}
      </nav>
      {subs.length === 0 ? (
        <Empty title={`No ${status} submissions.`} />
      ) : (
        <ul className="space-y-3">
          {subs.map((s) => (
            <li key={s.id} className="rounded-lg border border-line p-4 text-sm">
              <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="break-all font-medium">{s.url}</a>
              {s.note && <p className="mt-1 whitespace-pre-line">{s.note}</p>}
              <p className="mt-1 text-xs text-slate">Received {ago(s.createdAt)}{s.contactEmail ? ` — contact: ${s.contactEmail}` : " — no contact given"}</p>
              {s.status === "promoted" && s.itemId && <Link href={`/admin/inbox/${s.itemId}`} className="text-xs">Open in inbox</Link>}
              {s.status === "pending" && (
                <form action={submissionAction} className="mt-3 flex flex-wrap gap-2">
                  <Csrf />
                  <input type="hidden" name="id" value={s.id} />
                  <button name="op" value="promote" className="btn btn-primary">Add to inbox</button>
                  <button name="op" value="reject" className="btn btn-secondary">Reject</button>
                  <button name="op" value="spam" className="btn btn-danger">Spam</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
