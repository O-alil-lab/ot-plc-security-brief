import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { fmtDate } from "@/lib/queries";
import { SignupForm } from "@/components/SignupForm";
import { DemoBadge } from "@/components/Lamp";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Newsletter archive" };

export default async function NewsletterArchive() {
  const issues = await prisma.newsletterIssue.findMany({
    where: { status: { in: ["sent", "partially_failed"] } },
    orderBy: { number: "desc" },
    include: { _count: { select: { stories: true } } },
  });
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold">Newsletter archive</h1>
      <p className="mt-2 max-w-[60ch] text-slate">Every issue we have sent, with links to the stories and their original sources.</p>
      {issues.length === 0 ? (
        <div className="mt-8 rounded-lg border border-line p-6">
          <p className="font-medium">No issues have been sent yet.</p>
          <p className="mb-4 mt-1 text-sm text-slate">Subscribe to receive the first one.</p>
          <SignupForm />
        </div>
      ) : (
        <ol className="mt-8">
          {issues.map((i) => (
            <li key={i.id} className="grid gap-x-6 border-t border-line py-4 sm:grid-cols-[8.5rem_1fr]">
              <span className="text-sm text-slate">{fmtDate(i.publishedAt)}</span>
              <div>
                <Link href={`/newsletter/${i.number}`} className="text-lg font-semibold">
                  #{i.number}: {i.title}
                </Link>{" "}
                {i.isDemo && <DemoBadge />}
                <p className="text-sm text-slate">{i._count.stories} {i._count.stories === 1 ? "story" : "stories"}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
