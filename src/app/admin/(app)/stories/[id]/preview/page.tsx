import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth/session";
import { kevMatches } from "@/lib/kev";
import { StoryBody } from "@/components/StoryBody";

export default async function StoryPreview({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  const story = await prisma.story.findUnique({ where: { id }, include: { sources: { include: { item: { include: { source: true } } } } } });
  if (!story) notFound();
  return (
    <>
      <p className="mb-4 rounded-md bg-amber-50 p-3 text-sm">Preview — this is how the story will look on the public site. Status: {story.editorialStatus}.</p>
      <StoryBody story={story} kev={await kevMatches(story.cveIds)} preview />
    </>
  );
}
