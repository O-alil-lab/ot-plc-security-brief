import type { Source, TrustLevel } from "@prisma/client";
import { prisma } from "@/lib/db";

export async function resetDb() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`;
  if (tables.length) await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
}

let n = 0;
export async function makeSource(over: Partial<Source> & { trustLevel?: TrustLevel } = {}) {
  n++;
  return prisma.source.create({
    data: { name: `Source ${n}`, url: `https://feeds.example.com/${n}.xml`, type: "rss", trustLevel: "news", category: "ot-news", ...over },
  });
}

export function rssXml(items: { title: string; link?: string; guid?: string; description?: string; pubDate?: string }[]) {
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>T</title>${items
    .map(
      (i) =>
        `<item><title>${i.title}</title>${i.link ? `<link>${i.link}</link>` : ""}${i.guid ? `<guid>${i.guid}</guid>` : ""}${i.description ? `<description>${i.description}</description>` : ""}${i.pubDate ? `<pubDate>${i.pubDate}</pubDate>` : ""}</item>`,
    )
    .join("")}</channel></rss>`;
}
