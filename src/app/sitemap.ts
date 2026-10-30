import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.baseUrl;
  const [stories, issues] = await Promise.all([
    prisma.story.findMany({ where: { editorialStatus: "published" }, select: { slug: true, updatedAt: true } }),
    prisma.newsletterIssue.findMany({ where: { status: { in: ["sent", "partially_failed"] } }, select: { number: true, updatedAt: true } }),
  ]);
  const staticPages = ["", "/feed", "/newsletter", "/about", "/submit", "/community-guidelines", "/privacy"].map((p) => ({ url: `${base}${p}` }));
  return [
    ...staticPages,
    ...stories.map((s) => ({ url: `${base}/stories/${s.slug}`, lastModified: s.updatedAt })),
    ...issues.map((i) => ({ url: `${base}/newsletter/${i.number}`, lastModified: i.updatedAt })),
  ];
}
