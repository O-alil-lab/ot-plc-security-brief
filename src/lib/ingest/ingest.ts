import type { CollectedItem, FetchStatus, Prisma, Source } from "@prisma/client";
import { prisma } from "../db";
import { safeFetch, FetchError, type SafeFetchOptions } from "./fetcher";
import { parseFeed, FeedParseError, type ParsedItem } from "./parse";
import { normalizeUrl, extractIds, headlineSimilarity, contentHash } from "./normalize";
import { scoreRelevance } from "./relevance";
import { DUPLICATE_SIMILARITY_THRESHOLD } from "../../../config/relevance";

export type RunResult = {
  runId: string;
  status: FetchStatus;
  itemsSeen: number;
  itemsNew: number;
  itemsUpdated: number;
  error?: string;
  httpStatus?: number;
};

export const MIN_POLL_MINUTES = 30;
/** Items already older than this when first collected skip the review queue. */
export const BACKLOG_DAYS = 30;
const MAX_BACKOFF_MINUTES = 24 * 60;

/** Next time a source is due, with exponential backoff after failures. */
export function nextDueAt(source: Pick<Source, "lastAttemptAt" | "pollIntervalMinutes" | "consecutiveFailures">): Date {
  if (!source.lastAttemptAt) return new Date(0);
  const base = Math.max(MIN_POLL_MINUTES, source.pollIntervalMinutes);
  const factor = 2 ** Math.min(source.consecutiveFailures, 6);
  const minutes = Math.min(base * factor, MAX_BACKOFF_MINUTES);
  return new Date(source.lastAttemptAt.getTime() + minutes * 60_000);
}

async function findDuplicateCandidate(
  tx: Prisma.TransactionClient,
  item: { id: string; sourceId: string; canonicalUrl: string | null; title: string; extractedIds: string[] },
): Promise<{ match: CollectedItem | null; reason: string | null; suggestions: string[] }> {
  if (item.canonicalUrl) {
    const sameUrl = await tx.collectedItem.findFirst({
      where: { canonicalUrl: item.canonicalUrl, id: { not: item.id } },
      orderBy: { collectedAt: "asc" },
    });
    if (sameUrl) return { match: sameUrl, reason: "Same canonical URL", suggestions: [] };
  }
  const since = new Date(Date.now() - 21 * 86_400_000);
  const recent = await tx.collectedItem.findMany({
    where: { collectedAt: { gte: since }, id: { not: item.id } },
    select: { id: true, sourceId: true, title: true, extractedIds: true, duplicateGroupId: true },
    orderBy: { collectedAt: "desc" },
    take: 500,
  });
  let best: { id: string; score: number } | null = null;
  const suggestions: string[] = [];
  for (const r of recent) {
    const sharesId = item.extractedIds.length > 0 && r.extractedIds.some((x) => item.extractedIds.includes(x));
    // Headline similarity only groups items from DIFFERENT sources, and never
    // when both carry identifiers that don't overlap (e.g. two separate
    // advisories with near-identical titles, or recurring bulletins).
    const idsConflict = item.extractedIds.length > 0 && r.extractedIds.length > 0 && !sharesId;
    const sim = r.sourceId === item.sourceId || idsConflict ? 0 : headlineSimilarity(item.title, r.title);
    if (sim >= DUPLICATE_SIMILARITY_THRESHOLD && (!best || sim > best.score)) best = { id: r.id, score: sim };
    else if (sharesId) {
      // Shared CVE/advisory ID is only a signal: suggest, never auto-merge.
      suggestions.push(r.id);
    }
  }
  if (best) {
    const match = await tx.collectedItem.findUnique({ where: { id: best.id } });
    return { match, reason: `Similar headline (${Math.round(best.score * 100)}%)`, suggestions: suggestions.slice(0, 10) };
  }
  return { match: null, reason: null, suggestions: suggestions.slice(0, 10) };
}

/** Insert or update parsed items for a source. Exported for tests and imports. */
export async function upsertItems(source: Source, parsed: ParsedItem[], now = new Date()) {
  let itemsNew = 0;
  let itemsUpdated = 0;
  for (const p of parsed) {
    const hash = contentHash(p.title, p.excerpt, p.sourceUpdatedAt);
    const ids = extractIds(p.title, p.excerpt, p.url);
    const relevance = scoreRelevance({
      title: p.title,
      excerpt: p.excerpt,
      identifiers: ids,
      trustLevel: source.trustLevel,
      publishedAt: p.publishedAt,
      now,
    });

    await prisma.$transaction(async (tx) => {
      const existing = await tx.collectedItem.findUnique({ where: { sourceId_guid: { sourceId: source.id, guid: p.guid } } });
      if (existing) {
        if (existing.contentHash === hash) return;
        await tx.itemRevision.create({
          data: { itemId: existing.id, previousTitle: existing.title, previousExcerpt: existing.excerpt, previousHash: existing.contentHash },
        });
        await tx.collectedItem.update({
          where: { id: existing.id },
          data: {
            title: p.title,
            excerpt: p.excerpt,
            url: p.url,
            canonicalUrl: normalizeUrl(p.url),
            sourceUpdatedAt: p.sourceUpdatedAt ?? now,
            contentHash: hash,
            extractedIds: ids,
            relevanceScore: relevance.total,
            relevanceBreakdown: relevance as unknown as Prisma.InputJsonValue,
            // Bring updated items back to the editor's attention unless rejected.
            inboxStatus: existing.inboxStatus === "rejected" ? "rejected" : existing.inboxStatus === "used" ? "used" : "new",
          },
        });
        itemsUpdated++;
        return;
      }

      const created = await tx.collectedItem.create({
        data: {
          sourceId: source.id,
          guid: p.guid,
          url: p.url,
          canonicalUrl: normalizeUrl(p.url),
          title: p.title,
          excerpt: p.excerpt,
          author: p.author,
          publishedAt: p.publishedAt,
          sourceUpdatedAt: p.sourceUpdatedAt,
          contentHash: hash,
          extractedIds: ids,
          relevanceScore: relevance.total,
          relevanceBreakdown: relevance as unknown as Prisma.InputJsonValue,
          isDemo: source.isDemo,
          // Old back-catalogue entries (e.g. a vendor feed's full history) are kept
          // for search and deduplication but don't flood the review queue.
          inboxStatus: p.publishedAt && now.getTime() - p.publishedAt.getTime() > BACKLOG_DAYS * 86_400_000 && !source.isDemo ? "archived" : "new",
        },
      });
      itemsNew++;

      const { match, reason, suggestions } = await findDuplicateCandidate(tx, created);
      let groupId: string | null = null;
      if (match && reason) {
        groupId = match.duplicateGroupId;
        if (!groupId) {
          const g = await tx.duplicateGroup.create({ data: { reason } });
          groupId = g.id;
          await tx.collectedItem.update({ where: { id: match.id }, data: { duplicateGroupId: groupId } });
        }
      }
      if (groupId || suggestions.length) {
        await tx.collectedItem.update({
          where: { id: created.id },
          data: { duplicateGroupId: groupId, suggestedGroupIds: suggestions },
        });
      }
    });
  }
  return { itemsNew, itemsUpdated };
}

/**
 * Fetch, parse and store one source. A failure is ALWAYS recorded as a
 * failure (never as "0 new items").
 */
export async function runSource(
  sourceId: string,
  opts: { trigger?: "schedule" | "manual" | "test"; fetchOptions?: SafeFetchOptions } = {},
): Promise<RunResult> {
  const source = await prisma.source.findUniqueOrThrow({ where: { id: sourceId } });
  const run = await prisma.fetchRun.create({
    data: { sourceId, status: "ok", trigger: opts.trigger ?? "schedule" },
  });
  const startedAt = new Date();
  await prisma.source.update({ where: { id: sourceId }, data: { lastAttemptAt: startedAt } });

  const fail = async (status: FetchStatus, error: string, httpStatus?: number): Promise<RunResult> => {
    await prisma.fetchRun.update({
      where: { id: run.id },
      data: { status, error: error.slice(0, 1000), httpStatus, finishedAt: new Date() },
    });
    await prisma.source.update({
      where: { id: sourceId },
      data: { lastStatus: status, lastError: error.slice(0, 1000), consecutiveFailures: { increment: 1 } },
    });
    return { runId: run.id, status, itemsSeen: 0, itemsNew: 0, itemsUpdated: 0, error, httpStatus };
  };

  if (!source.url || (source.type !== "rss" && source.type !== "atom")) {
    return fail("blocked", "Source has no fetchable RSS/Atom URL");
  }

  let body: string;
  try {
    const res = await safeFetch(source.url, { etag: source.etag, lastModified: source.lastModified, ...opts.fetchOptions });
    if (res.notModified) {
      await prisma.fetchRun.update({ where: { id: run.id }, data: { status: "ok", httpStatus: 304, finishedAt: new Date() } });
      await prisma.source.update({
        where: { id: sourceId },
        data: { lastStatus: "ok", lastError: null, lastSuccessAt: new Date(), consecutiveFailures: 0 },
      });
      return { runId: run.id, status: "ok", itemsSeen: 0, itemsNew: 0, itemsUpdated: 0, httpStatus: 304 };
    }
    body = res.body;
    await prisma.source.update({ where: { id: sourceId }, data: { etag: res.etag ?? null, lastModified: res.lastModified ?? null } });
  } catch (e) {
    if (e instanceof FetchError) {
      const status: FetchStatus =
        e.kind === "http_error" && (e.httpStatus === 401 || e.httpStatus === 403 || e.httpStatus === 429) ? "blocked" : e.kind;
      return fail(status, e.message, e.httpStatus);
    }
    return fail("network_error", (e as Error).message);
  }

  let parsed;
  try {
    parsed = await parseFeed(body);
  } catch (e) {
    return fail("parse_error", e instanceof FeedParseError ? e.message : `Parse failed: ${(e as Error).message}`);
  }

  const { itemsNew, itemsUpdated } = await upsertItems(source, parsed.items);
  await prisma.fetchRun.update({
    where: { id: run.id },
    data: {
      status: "ok",
      httpStatus: 200,
      itemsSeen: parsed.items.length,
      itemsNew,
      itemsUpdated,
      error: parsed.repaired ? "Feed was malformed; parsed after automatic repair" : null,
      finishedAt: new Date(),
    },
  });
  await prisma.source.update({
    where: { id: sourceId },
    data: { lastStatus: "ok", lastError: null, lastSuccessAt: new Date(), consecutiveFailures: 0 },
  });
  return { runId: run.id, status: "ok", itemsSeen: parsed.items.length, itemsNew, itemsUpdated };
}

/** Run every enabled source that is due. Concurrency-limited. */
export async function runDueSources(now = new Date(), concurrency = 3, maxSources = Infinity): Promise<RunResult[]> {
  const sources = await prisma.source.findMany({
    where: { enabled: true, type: { in: ["rss", "atom"] }, url: { not: null }, isDemo: false },
  });
  // Oldest-attempted first, so a capped run still rotates through every source.
  const due = sources
    .filter((s) => nextDueAt(s) <= now)
    .sort((a, b) => (a.lastAttemptAt?.getTime() ?? 0) - (b.lastAttemptAt?.getTime() ?? 0))
    .slice(0, maxSources);
  const results: RunResult[] = [];
  let i = 0;
  async function workerLoop() {
    while (i < due.length) {
      const s = due[i++];
      try {
        results.push(await runSource(s.id, { trigger: "schedule" }));
      } catch (e) {
        console.error(`[ingest] unexpected error for source ${s.id}:`, (e as Error).message);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, due.length) }, workerLoop));
  return results;
}
