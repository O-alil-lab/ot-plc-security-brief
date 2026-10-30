import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { fmtDate } from "@/lib/queries";
import { issueInclude } from "@/lib/newsletter/send";
import { VerificationLamp } from "@/components/Lamp";

export const dynamic = "force-dynamic";

async function load(n: string) {
  const number = Number(n);
  if (!Number.isInteger(number) || number < 1) return null;
  return prisma.newsletterIssue.findFirst({ where: { number, status: { in: ["sent", "partially_failed"] } }, include: issueInclude });
}

export async function generateMetadata({ params }: { params: Promise<{ number: string }> }): Promise<Metadata> {
  const issue = await load((await params).number);
  return { title: issue ? `Issue #${issue.number}: ${issue.title}` : "Issue not found" };
}

export default async function IssuePage({ params }: { params: Promise<{ number: string }> }) {
  const issue = await load((await params).number);
  if (!issue) notFound();
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <nav className="text-sm"><Link href="/newsletter">Newsletter archive</Link></nav>
      <p className="mt-4 text-sm text-slate">Issue #{issue.number} — sent {fmtDate(issue.publishedAt)}</p>
      <h1 className="mt-1 text-3xl font-bold">{issue.title}</h1>
      {issue.intro && <div className="prose-brief mt-4 text-lg">{issue.intro.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}</div>}
      <ol className="mt-6">
        {issue.stories.map(({ story }) => (
          <li key={story.id} className="border-t border-line py-6">
            <VerificationLamp status={story.verificationStatus} compact />
            <h2 className="mt-1 text-2xl font-semibold">
              {story.editorialStatus === "published" ? <Link href={`/stories/${story.slug}`} className="text-ink">{story.headline}</Link> : story.headline}
            </h2>
            <div className="prose-brief mt-2">{story.summary.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}</div>
            {story.whyItMatters && <p className="max-w-[68ch]"><strong>Why it matters:</strong> {story.whyItMatters}</p>}
            <ul className="mt-3 space-y-1 text-sm">
              {story.sources.map(({ item }) => (
                <li key={item.id}>
                  {item.url ? <a href={item.url} rel="noopener noreferrer nofollow">{item.source.name}</a> : item.source.name}{" "}
                  <span className="text-slate">({fmtDate(item.publishedAt)})</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      {issue.footer && <p className="border-t border-line pt-4 text-sm text-slate">{issue.footer}</p>}
    </div>
  );
}
