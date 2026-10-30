import type { Prisma, VerificationStatus } from "@prisma/client";
import { prisma } from "./db";

export const PAGE_SIZE = 12;

export type FeedFilters = {
  q?: string;
  category?: string;
  vendor?: string;
  product?: string;
  source?: string;
  verification?: VerificationStatus;
  from?: string;
  to?: string;
  page?: number;
};

const storyListInclude = {
  sources: { include: { item: { select: { publishedAt: true, url: true, source: { select: { name: true, trustLevel: true } } } } } },
} satisfies Prisma.StoryInclude;

export type StoryListItem = Prisma.StoryGetPayload<{ include: typeof storyListInclude }>;

function parseDate(v?: string): Date | undefined {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export async function publishedStories(f: FeedFilters) {
  const where: Prisma.StoryWhereInput = { editorialStatus: "published" };
  const and: Prisma.StoryWhereInput[] = [];
  if (f.q) {
    const q = f.q.slice(0, 100);
    and.push({
      OR: [
        { headline: { contains: q, mode: "insensitive" } },
        { summary: { contains: q, mode: "insensitive" } },
        { cveIds: { has: q.toUpperCase() } },
        { advisoryIds: { has: q.toUpperCase() } },
        { vendors: { has: q } },
        { products: { has: q } },
      ],
    });
  }
  if (f.category) and.push({ categories: { has: f.category } });
  if (f.vendor) and.push({ vendors: { has: f.vendor } });
  if (f.product) and.push({ products: { has: f.product } });
  if (f.verification) and.push({ verificationStatus: f.verification });
  if (f.source) and.push({ sources: { some: { item: { source: { name: f.source } } } } });
  const from = parseDate(f.from);
  const to = parseDate(f.to);
  if (from || to) and.push({ publishedAt: { gte: from, lt: to ? new Date(to.getTime() + 86_400_000) : undefined } });
  if (and.length) where.AND = and;

  const page = Math.max(1, Math.min(f.page ?? 1, 500));
  const [total, stories] = await Promise.all([
    prisma.story.count({ where }),
    prisma.story.findMany({
      where,
      include: storyListInclude,
      orderBy: { publishedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);
  return { total, stories, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

/** Distinct values used by the public filter controls. */
export async function feedFacets() {
  const stories = await prisma.story.findMany({
    where: { editorialStatus: "published" },
    select: { categories: true, vendors: true, products: true, sources: { select: { item: { select: { source: { select: { name: true } } } } } } },
  });
  const uniq = (xs: string[]) => [...new Set(xs)].sort((a, b) => a.localeCompare(b));
  return {
    categories: uniq(stories.flatMap((s) => s.categories)),
    vendors: uniq(stories.flatMap((s) => s.vendors)),
    products: uniq(stories.flatMap((s) => s.products)),
    sources: uniq(stories.flatMap((s) => s.sources.map((x) => x.item.source.name))),
  };
}

export const CATEGORY_LABELS: Record<string, string> = {
  "ics-advisories": "ICS advisories",
  advisories: "Government advisories",
  "vendor-advisories": "Vendor advisories",
  "ot-research": "OT research",
  "ot-news": "OT news",
  "security-news": "Security news",
  social: "Social",
  community: "Community",
  demo: "Demo",
};

export function categoryLabel(c: string) {
  return CATEGORY_LABELS[c] ?? c.replace(/-/g, " ");
}

export function fmtDate(d: Date | null | undefined) {
  if (!d) return "Date unknown";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** Earliest original publication date among a story's sources. */
export function originalDate(story: StoryListItem): Date | null {
  const dates = story.sources.map((s) => s.item.publishedAt).filter((d): d is Date => !!d);
  return dates.length ? new Date(Math.min(...dates.map((d) => d.getTime()))) : null;
}
