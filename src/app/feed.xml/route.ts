import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { escapeHtml } from "@/lib/newsletter/render";

export const dynamic = "force-dynamic";

/** RSS 2.0 feed of published stories. */
export async function GET() {
  const stories = await prisma.story.findMany({ where: { editorialStatus: "published" }, orderBy: { publishedAt: "desc" }, take: 50 });
  const base = env.baseUrl;
  const items = stories
    .map(
      (s) => `<item>
<title>${escapeHtml(s.headline)}</title>
<link>${base}/stories/${escapeHtml(s.slug)}</link>
<guid isPermaLink="true">${base}/stories/${escapeHtml(s.slug)}</guid>
<pubDate>${(s.publishedAt ?? s.createdAt).toUTCString()}</pubDate>
<description>${escapeHtml(s.summary.slice(0, 600))}</description>
${s.categories.map((c) => `<category>${escapeHtml(c)}</category>`).join("")}
</item>`,
    )
    .join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>OT &amp; PLC Security Brief</title>
<link>${base}</link>
<atom:link href="${base}/feed.xml" rel="self" type="application/rss+xml"/>
<description>Verified PLC, OT, ICS and industrial cybersecurity news.</description>
<language>en</language>
${items}
</channel>
</rss>`;
  return new Response(xml, { headers: { "content-type": "application/rss+xml; charset=utf-8", "cache-control": "public, max-age=600" } });
}
