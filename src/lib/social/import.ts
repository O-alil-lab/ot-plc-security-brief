import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { audit } from "../audit";
import { toPlainText, safeHttpUrl } from "../sanitize";
import { upsertItems } from "../ingest/ingest";

/**
 * Social import JSON schema (version 1).
 * Any external discovery tool (e.g. an Agent Reach export run separately by
 * the operator) can be converted to this shape. No logins, no cookies.
 */
export const socialPostSchema = z.object({
  platform: z.string().trim().min(1).max(40),
  author: z.string().trim().max(120).optional(),
  url: z.string().trim().url().max(2000),
  publishedAt: z.string().datetime({ offset: true }).optional(),
  text: z.string().max(5000).optional(),
  linkedPrimarySource: z.string().trim().url().max(2000).optional(),
});
export const socialImportSchema = z.object({
  version: z.literal(1).default(1),
  posts: z.array(socialPostSchema).min(1).max(500),
});
export type SocialImport = z.input<typeof socialImportSchema>;

export async function getOrCreateSystemSource(kind: "social" | "submission") {
  const name = kind === "social" ? "Social imports" : "Community submissions";
  const existing = await prisma.source.findFirst({ where: { name, url: null } });
  if (existing) return existing;
  return prisma.source.create({
    data: {
      name,
      type: kind === "social" ? "social_import" : "submission",
      trustLevel: kind === "social" ? "social" : "community",
      category: kind === "social" ? "social" : "community",
      enabled: false, // never polled
    },
  });
}

/** Import social posts into the inbox. Every imported claim is unverified. */
export async function importSocialPosts(input: unknown, actor: string) {
  const data = socialImportSchema.parse(input);
  const source = await getOrCreateSystemSource("social");
  const posts = data.posts.flatMap((p) => {
    const url = safeHttpUrl(p.url);
    if (!url) return [];
    const text = toPlainText(p.text, 1200);
    return [
      {
        post: p,
        parsed: {
          guid: url,
          url,
          title: toPlainText(`${p.platform}${p.author ? ` · ${p.author}` : ""}: ${text.slice(0, 140) || url}`, 300),
          excerpt: text,
          author: p.author ? toPlainText(p.author, 120) : null,
          publishedAt: p.publishedAt ? new Date(p.publishedAt) : null,
          sourceUpdatedAt: null,
        },
      },
    ];
  });
  const res = await upsertItems(source, posts.map((p) => p.parsed));
  for (const { post, parsed } of posts) {
    await prisma.collectedItem.update({
      where: { sourceId_guid: { sourceId: source.id, guid: parsed.guid } },
      data: {
        socialMeta: {
          platform: toPlainText(post.platform, 40),
          author: post.author ? toPlainText(post.author, 120) : null,
          linkedPrimarySource: safeHttpUrl(post.linkedPrimarySource),
          verification: "unverified",
        } satisfies Prisma.InputJsonValue,
      },
    });
  }
  await audit(actor, "social.import", "source", source.id, { posts: posts.length, new: res.itemsNew });
  return { imported: posts.length, ...res };
}
