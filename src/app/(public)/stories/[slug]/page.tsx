import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { categoryLabel } from "@/lib/queries";
import { kevMatches } from "@/lib/kev";
import { StoryBody } from "@/components/StoryBody";

export const dynamic = "force-dynamic";

async function load(slug: string) {
  return prisma.story.findFirst({
    where: { slug, editorialStatus: "published" },
    include: { sources: { include: { item: { include: { source: true, revisions: { select: { detectedAt: true } } } } } } },
  });
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const story = await load((await params).slug);
  if (!story) return { title: "Story not found" };
  return {
    title: story.headline,
    description: story.summary.slice(0, 200),
    openGraph: { title: story.headline, description: story.summary.slice(0, 200), type: "article" },
    alternates: { canonical: `/stories/${story.slug}` },
  };
}

export default async function StoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const story = await load((await params).slug);
  if (!story) notFound();
  const kev = await kevMatches(story.cveIds);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <nav aria-label="Breadcrumb" className="text-sm"><Link href="/feed">News feed</Link></nav>
      <StoryBody story={story} kev={kev} />
      <p className="mt-10 max-w-[68ch] border-t border-line pt-4 text-sm text-slate">
        Spotted an error? <Link href={`/submit?correction=${encodeURIComponent(story.slug)}`}>Tell us</Link> and an editor will review it.
        {story.categories.length > 0 && (
          <> Filed under {story.categories.map((c, i) => (
            <span key={c}>{i > 0 && ", "}<Link href={`/feed?category=${encodeURIComponent(c)}`}>{categoryLabel(c)}</Link></span>
          ))}.</>
        )}
      </p>
    </div>
  );
}

