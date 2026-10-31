import type { CollectedItem, Prisma, Source } from "@prisma/client";
import { prisma } from "../db";
import { audit } from "../audit";
import { runDueSources } from "../ingest/ingest";
import { getAIProvider, type SourceMaterial, type StorySuggestion } from "../ai/provider";
import { createStoryFromItems, updateStory, transitionStory, linkItem } from "../stories/workflow";
import { createIssue, updateIssue, markReviewed, startBulkSend } from "../newsletter/send";
import { getAgentSettings, agentDisabledByEnv, type AgentSettings } from "./settings";
import { validateSuggestion } from "./validate";
import { headlineSimilarity } from "../ingest/normalize";

export const AGENT_ACTOR = "news-agent";

type ItemWithSource = CollectedItem & { source: Source };
export type AgentLogEntry = { at: string; level: "info" | "warn"; msg: string };
export type AgentRunOptions = { trigger?: "schedule" | "manual" | "cron" | "test"; dryRun?: boolean; now?: Date; skipFetch?: boolean };
export type AgentRunSummary = {
  runId: string | null;
  status: "ok" | "failed" | "skipped";
  sourcesFetched: number;
  candidates: number;
  storiesCreated: number;
  storiesPublished: number;
  itemsLinked: number;
  issueId: string | null;
  log: AgentLogEntry[];
};

const TRUST_RANK: Record<string, number> = { primary_vendor: 0, government_cert: 1, research: 2, news: 3, social: 4, community: 5 };

/** Group candidate items that describe the same thing (duplicate group or shared CVE/advisory IDs). */
export function clusterItems(items: ItemWithSource[]): ItemWithSource[][] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    while (parent.get(x) !== x) x = parent.get(x)!;
    return x;
  };
  const union = (a: string, b: string) => parent.set(find(a), find(b));
  for (const i of items) parent.set(i.id, i.id);
  const byKey = new Map<string, string>();
  for (const i of items) {
    const keys = [...i.extractedIds.map((id) => `id:${id}`), ...(i.duplicateGroupId ? [`grp:${i.duplicateGroupId}`] : [])];
    for (const k of keys) {
      const seen = byKey.get(k);
      if (seen) union(i.id, seen);
      else byKey.set(k, i.id);
    }
  }
  // Same advisory republished by another source with different IDs/titles
  // (e.g. a Siemens SSA and the CISA ICSA for it): compare the opening text.
  for (let a = 0; a < items.length; a++) {
    for (let b = a + 1; b < items.length; b++) {
      if (items[a].sourceId !== items[b].sourceId && sameStoryText(items[a], items[b])) union(items[a].id, items[b].id);
    }
  }
  const groups = new Map<string, ItemWithSource[]>();
  for (const i of items) {
    const r = find(i.id);
    groups.set(r, [...(groups.get(r) ?? []), i]);
  }
  return [...groups.values()].map((g) =>
    g.sort((a, b) => TRUST_RANK[a.source.trustLevel] - TRUST_RANK[b.source.trustLevel] || b.relevanceScore - a.relevanceScore),
  );
}

const opening = (i: Pick<CollectedItem, "excerpt" | "title">) => (i.excerpt && i.excerpt.length >= 60 ? i.excerpt : i.title).slice(0, 300);

/** True when two items' opening text is near-identical (republished advisory). */
export function sameStoryText(a: Pick<CollectedItem, "excerpt" | "title">, b: Pick<CollectedItem, "excerpt" | "title">): boolean {
  if (!a.excerpt || !b.excerpt || a.excerpt.length < 60 || b.excerpt.length < 60) return false;
  return headlineSimilarity(opening(a), opening(b)) >= 0.6;
}

/** Cut text at a sentence boundary within `max` characters. */
export function trimToSentence(text: string, max = 600): string {
  const t = text.replace(/…$/, "").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf(".\n"));
  return end >= 40 ? cut.slice(0, end + 1) : `${cut.slice(0, cut.lastIndexOf(" "))}…`;
}

/** Readable headline from a feed title (drops Siemens "SSA-… V1.2 (Last Update: …):" prefixes, names bare CISA products). */
export function cleanHeadline(title: string, sourceName: string, ids: string[]): string {
  let h = title
    .replace(/^SS[AB]-\d{6}\s*(V\d+(\.\d+)*)?\s*(\(Last Update:[^)]*\))?\s*:\s*/i, "")
    .replace(/^(CVE-\d{4}-\d{4,7}\s*,?\s*(and\s*)?)+:\s*/i, "")
    .trim();
  // Name the vendor when the title doesn't (e.g. Moxa titles start with CVE IDs).
  const vendor = sourceName.split(/\s+/)[0];
  if (/^(Moxa|Siemens|Mitsubishi|Fortinet|Palo)$/i.test(vendor) && !new RegExp(`\\b${vendor}\\b`, "i").test(h)) h = `${vendor}: ${h}`;
  if (h.split(/\s+/).length <= 4) {
    const adv = ids.find((x) => /^(ICSA|ICSMA|SSA|VDE|VU#|MPSA)/.test(x));
    h = `${h}: security advisory${adv ? ` ${adv}` : ""} (${sourceName.replace(/ Advisories$/, "")})`;
  }
  return h.slice(0, 200);
}

function sourceText(cluster: ItemWithSource[]): string {
  return cluster.map((i) => `${i.source.name}\n${i.title}\n${i.excerpt ?? ""}\n${i.url ?? ""}`).join("\n\n");
}

/** Publisher's own wording, used when AI is unavailable or its draft fails validation. */
export function fallbackStory(cluster: ItemWithSource[]): StorySuggestion {
  const lead = cluster[0];
  const excerpt = (lead.excerpt ?? "").trim();
  const summary =
    excerpt.length >= 40
      ? `${lead.source.name} reports: ${trimToSentence(excerpt)}`
      : `${lead.source.name} published an advisory titled "${lead.title}". See the original advisory for the affected products, versions and fixes.`;
  return {
    headline: cleanHeadline(lead.title, lead.source.name, [...new Set(cluster.flatMap((i) => i.extractedIds))]),
    summary: summary.slice(0, 4000),
    whyItMatters: "",
    defensiveGuidance: "",
    guidanceSource: "",
    categories: [],
    vendors: [],
    products: [],
    unknowns: [],
  };
}

/** The most recent weekly send slot at or before `now` (UTC). */
export function currentSendSlot(now: Date, weekday: number, hourUtc: number): Date {
  const slot = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hourUtc));
  const diff = (now.getUTCDay() - weekday + 7) % 7;
  slot.setUTCDate(slot.getUTCDate() - diff);
  if (slot > now) slot.setUTCDate(slot.getUTCDate() - 7);
  return slot;
}

async function writeAndPublish(cluster: ItemWithSource[], settings: AgentSettings, dryRun: boolean, log: (l: AgentLogEntry["level"], m: string) => void) {
  const lead = cluster[0];
  const ids = [...new Set(cluster.flatMap((i) => i.extractedIds))];

  // Already covered? Attach the new source to the existing story instead of duplicating it.
  const groupIds = cluster.map((i) => i.duplicateGroupId).filter((g): g is string => !!g);
  const existing = await prisma.story.findFirst({
    where: {
      createdAt: { gte: new Date(Date.now() - 60 * 86_400_000) },
      editorialStatus: { not: "rejected" },
      OR: [
        ...(ids.filter((x) => x.startsWith("CVE-")).length ? [{ cveIds: { hasSome: ids.filter((x) => x.startsWith("CVE-")) } }] : []),
        ...(ids.filter((x) => !x.startsWith("CVE-")).length ? [{ advisoryIds: { hasSome: ids.filter((x) => !x.startsWith("CVE-")) } }] : []),
        ...(groupIds.length ? [{ sources: { some: { item: { duplicateGroupId: { in: groupIds } } } } }] : []),
      ],
    },
  });
  let match = existing && ids.length + groupIds.length > 0 ? existing : null;
  if (!match) {
    const recentStories = await prisma.story.findMany({
      where: { createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) }, editorialStatus: { not: "rejected" } },
      include: { sources: { include: { item: { select: { excerpt: true, title: true, sourceId: true } } } } },
      take: 300,
    });
    match = recentStories.find((st) => st.sources.some(({ item }) => cluster.some((c) => c.sourceId !== item.sourceId && sameStoryText(c, item)))) ?? null;
  }
  if (match) {
    const existing = match;
    if (!dryRun) for (const i of cluster) await linkItem(existing.id, i.id, AGENT_ACTOR);
    log("info", `Linked ${cluster.length} new source(s) to existing story "${existing.headline}"`);
    return { created: false, published: false, linked: cluster.length };
  }

  if (dryRun) {
    log("info", `Would write: "${lead.title}" (${lead.source.name}, relevance ${lead.relevanceScore}, ${cluster.length} source(s))`);
    return { created: false, published: false, linked: 0 };
  }

  // Write: AI from the source text, validated; otherwise the publisher's own wording.
  let draft: StorySuggestion = fallbackStory(cluster);
  let aiUsed = false;
  const ai = getAIProvider();
  if (ai.enabled) {
    try {
      const material: SourceMaterial[] = cluster.slice(0, 5).map((i) => ({
        title: i.title,
        url: i.url,
        sourceName: i.source.name,
        publishedAt: i.publishedAt,
        excerpt: i.excerpt,
      }));
      const v = validateSuggestion(await ai.suggestStory(material), sourceText(cluster));
      if (v.ok) {
        draft = v.story;
        aiUsed = true;
        if (v.dropped.length) log("info", `Removed unsupported details from "${lead.title.slice(0, 60)}": ${v.dropped.join(", ")}`);
      } else {
        log("warn", `AI draft rejected for "${lead.title.slice(0, 60)}" (${v.reason}); used the publisher's wording instead`);
      }
    } catch (e) {
      log("warn", `AI failed for "${lead.title.slice(0, 60)}": ${(e as Error).message.slice(0, 160)}; used the publisher's wording instead`);
    }
  }

  const story = await createStoryFromItems(
    cluster.map((i) => i.id),
    AGENT_ACTOR,
  );
  const vendors = [...new Set([...story.vendors, ...draft.vendors])];
  await updateStory(
    story.id,
    {
      headline: draft.headline.length >= 5 ? draft.headline : lead.title.slice(0, 200),
      summary: draft.summary,
      whyItMatters: draft.whyItMatters,
      defensiveGuidance: draft.defensiveGuidance,
      guidanceSource: draft.guidanceSource,
      categories: [...new Set([...story.categories, ...draft.categories])].join(", "),
      vendors: vendors.join(", "),
      products: draft.products.join(", "),
      affectedVersions: "",
      cveIds: story.cveIds.join(", "),
      advisoryIds: story.advisoryIds.join(", "),
      // Written from the vendor/CERT text, but no editor has checked it.
      verificationStatus: "partially_verified",
    },
    AGENT_ACTOR,
  );
  await prisma.story.update({ where: { id: story.id }, data: { autoGenerated: true, aiAssisted: aiUsed } });

  if (!settings.autoPublish) {
    log("info", `Drafted "${draft.headline.slice(0, 80)}" for review`);
    return { created: true, published: false, linked: 0 };
  }
  await transitionStory(story.id, "approved", AGENT_ACTOR);
  await transitionStory(story.id, "published", AGENT_ACTOR);
  log("info", `Published "${draft.headline.slice(0, 80)}"${aiUsed ? "" : " (publisher's wording)"}`);
  return { created: true, published: true, linked: 0 };
}

async function maybeSendWeekly(settings: AgentSettings, now: Date, dryRun: boolean, log: (l: AgentLogEntry["level"], m: string) => void): Promise<string | null> {
  if (!settings.autoSend) return null;
  const slot = currentSendSlot(now, settings.sendWeekday, settings.sendHourUtc);
  const marker = await prisma.appSetting.findUnique({ where: { key: "agent.lastSendSlot" } });
  if (marker && (marker.value as { slot?: string }).slot === slot.toISOString()) return null;

  const since = new Date(slot.getTime() - 7 * 86_400_000);
  const stories = await prisma.story.findMany({
    where: { editorialStatus: "published", isDemo: false, publishedAt: { gte: since, lte: now }, issues: { none: {} } },
    orderBy: { publishedAt: "desc" },
    take: settings.maxStoriesPerIssue,
  });
  const markSlot = () =>
    prisma.appSetting.upsert({
      where: { key: "agent.lastSendSlot" },
      create: { key: "agent.lastSendSlot", value: { slot: slot.toISOString() } },
      update: { value: { slot: slot.toISOString() } },
    });

  if (stories.length < settings.minStoriesPerIssue) {
    log("info", `Weekly issue skipped: ${stories.length} new published stories (minimum ${settings.minStoriesPerIssue})`);
    if (!dryRun) await markSlot();
    return null;
  }
  if (dryRun) {
    log("info", `Would send the weekly issue with ${stories.length} stories`);
    return null;
  }

  const vendors = [...new Set(stories.flatMap((s) => s.vendors))].slice(0, 8);
  const dateLabel = slot.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const issue = await createIssue(AGENT_ACTOR);
  await updateIssue(
    issue.id,
    {
      title: `Weekly briefing, ${dateLabel}`,
      subject: `OT & PLC Security Brief #${issue.number}: ${stories.length} industrial advisories this week`,
      previewText: vendors.length ? `This week: ${vendors.slice(0, 4).join(", ")} and more.` : "This week's industrial security advisories.",
      intro: [
        `This week's briefing covers ${stories.length} industrial security ${stories.length === 1 ? "advisory" : "advisories and updates"}${vendors.length ? `, including ${vendors.join(", ")}` : ""}. Every story links to the original vendor or CERT advisory.`,
        "Stories marked as automatically written were summarised from the publisher's text and have not been reviewed by an editor. Check the original advisory before acting.",
      ].join("\n\n"),
      footer: "You're receiving this because you subscribed to the OT & PLC Security Brief. Reply to this email with tips or corrections.",
      storyIds: stories.map((s) => s.id),
    },
    AGENT_ACTOR,
  );
  await markReviewed(issue.id, AGENT_ACTOR);
  const { recipients } = await startBulkSend(issue.id, String(issue.number), AGENT_ACTOR);
  await markSlot();
  log("info", `Weekly issue #${issue.number} queued for ${recipients} subscriber(s) with ${stories.length} stories`);
  return issue.id;
}

/**
 * One agent run: fetch the newest items from real sources, pick the relevant
 * primary-source items, write stories (AI, validated), publish them, and send
 * the weekly issue when it's due. Every action is recorded in AgentRun and the
 * audit log.
 */
export async function runAgent(opts: AgentRunOptions = {}): Promise<AgentRunSummary> {
  const now = opts.now ?? new Date();
  const dryRun = !!opts.dryRun;
  const log: AgentLogEntry[] = [];
  const add = (level: AgentLogEntry["level"], msg: string) => log.push({ at: new Date().toISOString(), level, msg });
  const empty = { sourcesFetched: 0, candidates: 0, storiesCreated: 0, storiesPublished: 0, itemsLinked: 0, issueId: null };

  const settings = await getAgentSettings();
  if (agentDisabledByEnv() || (!settings.enabled && opts.trigger !== "manual")) {
    return { runId: null, status: "skipped", ...empty, log: [{ at: now.toISOString(), level: "info", msg: "Agent is switched off" }] };
  }

  // Only one real run at a time (a dry run changes nothing, so it may overlap).
  const running = dryRun ? null : await prisma.agentRun.findFirst({ where: { status: "running", dryRun: false, startedAt: { gte: new Date(Date.now() - 30 * 60_000) } } });
  if (running) return { runId: null, status: "skipped", ...empty, log: [{ at: now.toISOString(), level: "info", msg: "The agent is already running; check back in a few minutes" }] };

  const run = await prisma.agentRun.create({ data: { trigger: opts.trigger ?? "schedule", dryRun } });
  const totals = { ...empty } as Omit<AgentRunSummary, "runId" | "status" | "log">;
  try {
    // 1. Fetch the newest items from every due source.
    if (!opts.skipFetch && !dryRun) {
      const results = await runDueSources(now);
      totals.sourcesFetched = results.length;
      const failed = results.filter((r) => r.status !== "ok");
      add("info", `Fetched ${results.length} due source(s): ${results.reduce((n, r) => n + r.itemsNew, 0)} new items${failed.length ? `, ${failed.length} failed` : ""}`);
    }

    // 2. Select candidates: new, recent, relevant, from allowed source types, industrial.
    const since = new Date(now.getTime() - settings.lookbackDays * 86_400_000);
    const items = (await prisma.collectedItem.findMany({
      where: {
        inboxStatus: "new",
        isDemo: false,
        relevanceScore: { gte: settings.minRelevance },
        publishedAt: { gte: since },
        source: { trustLevel: { in: settings.trustLevels }, isDemo: false },
      },
      include: { source: true },
      orderBy: [{ relevanceScore: "desc" }, { publishedAt: "desc" }],
      take: 300,
    })) as ItemWithSource[];
    const industrial = items.filter((i) => {
      const rb = (i.relevanceBreakdown ?? {}) as { terms?: string[]; vendors?: string[] };
      return (rb.terms?.length ?? 0) + (rb.vendors?.length ?? 0) > 0;
    });
    const clusters = clusterItems(industrial).sort((a, b) => b[0].relevanceScore - a[0].relevanceScore);
    totals.candidates = clusters.length;
    add("info", `${industrial.length} relevant item(s) in ${clusters.length} topic(s) (relevance ≥ ${settings.minRelevance}, last ${settings.lookbackDays} days)`);

    // 3. Write and publish, most relevant first.
    let written = 0;
    for (const cluster of clusters) {
      if (written >= settings.maxStoriesPerRun) {
        add("info", `Stopped at ${settings.maxStoriesPerRun} stories for this run; the rest wait for the next run`);
        break;
      }
      try {
        const r = await writeAndPublish(cluster, settings, dryRun, add);
        if (r.created) {
          totals.storiesCreated++;
          written++;
        } else if (dryRun && r.linked === 0) written++;
        if (r.published) totals.storiesPublished++;
        totals.itemsLinked += r.linked;
      } catch (e) {
        add("warn", `Skipped "${cluster[0].title.slice(0, 60)}": ${(e as Error).message.slice(0, 160)}`);
      }
    }

    // 4. Weekly newsletter.
    totals.issueId = await maybeSendWeekly(settings, now, dryRun, add);

    await prisma.agentRun.update({
      where: { id: run.id },
      data: { ...totals, status: "ok", finishedAt: new Date(), log: log as unknown as Prisma.InputJsonValue },
    });
    if (!dryRun) await audit(AGENT_ACTOR, "agent.run", "agentRun", run.id, { ...totals });
    return { runId: run.id, status: "ok", ...totals, log };
  } catch (e) {
    const msg = (e as Error).message.slice(0, 500);
    add("warn", `Run failed: ${msg}`);
    await prisma.agentRun.update({
      where: { id: run.id },
      data: { ...totals, status: "failed", error: msg, finishedAt: new Date(), log: log as unknown as Prisma.InputJsonValue },
    });
    return { runId: run.id, status: "failed", ...totals, log };
  }
}
