import type { EditorialStatus, Prisma, VerificationStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db";
import { audit } from "../audit";
import { PRIMARY_TRUST_LEVELS } from "../../../config/sources";

export class WorkflowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowError";
  }
}

/** Allowed editorial transitions. Publication is only reachable from "approved". */
export const TRANSITIONS: Record<EditorialStatus, EditorialStatus[]> = {
  draft: ["approved", "rejected"],
  approved: ["published", "draft", "rejected"],
  published: ["draft"], // unpublish (e.g. for a correction that needs re-review)
  rejected: ["draft"],
};

export function canTransition(from: EditorialStatus, to: EditorialStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "story"
  );
}

async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  let slug = slugify(base);
  for (let n = 2; ; n++) {
    const clash = await prisma.story.findUnique({ where: { slug } });
    if (!clash || clash.id === excludeId) return slug;
    slug = `${slugify(base).slice(0, 74)}-${n}`;
  }
}

const list = z
  .string()
  .default("")
  .transform((s) =>
    s
      .split(/[,\n]/)
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 30),
  );

export const storyInputSchema = z.object({
  headline: z.string().trim().min(5, "Headline is too short").max(200),
  summary: z.string().trim().max(4000).default(""),
  whyItMatters: z.string().trim().max(3000).default(""),
  defensiveGuidance: z.string().trim().max(3000).default(""),
  guidanceSource: z.string().trim().max(300).default(""),
  categories: list,
  vendors: list,
  products: list,
  affectedVersions: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v ? v : null)),
  cveIds: list.transform((ids) => ids.map((x) => x.toUpperCase())).pipe(z.array(z.string().regex(/^CVE-\d{4}-\d{4,7}$/, "Invalid CVE ID format"))),
  advisoryIds: list,
  verificationStatus: z.enum(["unverified", "partially_verified", "verified_primary"]).default("unverified"),
});
export type StoryInput = z.input<typeof storyInputSchema>;

async function assertVerification(storyId: string, status: VerificationStatus) {
  if (status !== "verified_primary") return;
  const primary = await prisma.storySource.count({
    where: { storyId, item: { source: { trustLevel: { in: PRIMARY_TRUST_LEVELS } } } },
  });
  if (primary === 0) {
    throw new WorkflowError('"Verified against primary source" requires at least one linked item from a vendor or government CERT source.');
  }
}

export async function createStoryFromItems(itemIds: string[], actor: string) {
  if (!itemIds.length) throw new WorkflowError("Select at least one item");
  const items = await prisma.collectedItem.findMany({ where: { id: { in: itemIds } }, include: { source: true } });
  if (!items.length) throw new WorkflowError("Items not found");
  const lead = items.sort((a, b) => b.relevanceScore - a.relevanceScore)[0];
  const ids = [...new Set(items.flatMap((i) => i.extractedIds))];
  const breakdowns = items.map((i) => (i.relevanceBreakdown ?? {}) as { vendors?: string[] });
  const vendors = [...new Set(breakdowns.flatMap((b) => b.vendors ?? []))];
  const story = await prisma.story.create({
    data: {
      headline: lead.title.slice(0, 200),
      slug: await uniqueSlug(lead.title),
      // Summary deliberately starts empty: the editor writes it from the sources.
      summary: "",
      cveIds: ids.filter((x) => x.startsWith("CVE-")),
      advisoryIds: ids.filter((x) => !x.startsWith("CVE-")),
      vendors,
      categories: [...new Set(items.map((i) => i.source.category))],
      isDemo: items.every((i) => i.isDemo),
      // Every new story starts unverified; only an editor can raise it.
      verificationStatus: "unverified",
      sources: { create: items.map((i) => ({ itemId: i.id })) },
    },
  });
  await prisma.collectedItem.updateMany({ where: { id: { in: itemIds } }, data: { inboxStatus: "used" } });
  await audit(actor, "story.create", "story", story.id, { itemIds });
  return story;
}

export async function updateStory(id: string, input: StoryInput, actor: string) {
  const data = storyInputSchema.parse(input);
  const existing = await prisma.story.findUniqueOrThrow({ where: { id } });
  await assertVerification(id, data.verificationStatus);
  const slug = existing.editorialStatus === "published" ? existing.slug : await uniqueSlug(data.headline, id);
  const story = await prisma.story.update({ where: { id }, data: { ...data, slug } });
  const changed = Object.keys(data).filter(
    (k) => JSON.stringify((existing as Record<string, unknown>)[k]) !== JSON.stringify((data as Record<string, unknown>)[k]),
  );
  await audit(actor, "story.update", "story", id, { changed });
  return story;
}

export async function transitionStory(id: string, to: EditorialStatus, actor: string) {
  const story = await prisma.story.findUniqueOrThrow({ where: { id }, include: { _count: { select: { sources: true } } } });
  if (!canTransition(story.editorialStatus, to)) {
    throw new WorkflowError(`Cannot move a story from "${story.editorialStatus}" to "${to}".`);
  }
  if (to === "approved") {
    if (story._count.sources < 1) throw new WorkflowError("Approval requires at least one linked source.");
    if (!story.summary.trim()) throw new WorkflowError("Write an editorial summary before approving.");
    await assertVerification(id, story.verificationStatus);
  }
  const data: Prisma.StoryUpdateInput = { editorialStatus: to };
  if (to === "approved") data.approvedAt = new Date();
  if (to === "published") data.publishedAt = story.publishedAt ?? new Date();
  if (to === "draft") data.approvedAt = null;
  const updated = await prisma.story.update({ where: { id }, data });
  await audit(actor, `story.${to}`, "story", id, { from: story.editorialStatus });
  return updated;
}

export async function linkItem(storyId: string, itemId: string, actor: string) {
  await prisma.storySource.upsert({ where: { storyId_itemId: { storyId, itemId } }, create: { storyId, itemId }, update: {} });
  await prisma.collectedItem.update({ where: { id: itemId }, data: { inboxStatus: "used" } });
  await audit(actor, "story.link_source", "story", storyId, { itemId });
}

export async function unlinkItem(storyId: string, itemId: string, actor: string) {
  const story = await prisma.story.findUniqueOrThrow({ where: { id: storyId }, include: { _count: { select: { sources: true } } } });
  if (story._count.sources <= 1 && story.editorialStatus !== "draft" && story.editorialStatus !== "rejected") {
    throw new WorkflowError("An approved or published story must keep at least one source. Move it back to draft first.");
  }
  await prisma.storySource.delete({ where: { storyId_itemId: { storyId, itemId } } });
  if (story.verificationStatus === "verified_primary") {
    try {
      await assertVerification(storyId, "verified_primary");
    } catch {
      await prisma.story.update({ where: { id: storyId }, data: { verificationStatus: "partially_verified" } });
    }
  }
  await audit(actor, "story.unlink_source", "story", storyId, { itemId });
}
