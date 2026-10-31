import { prisma } from "./db";
import { runDueSources, type RunResult } from "./ingest/ingest";
import { processSending } from "./newsletter/send";
import { syncKev } from "./kev";
import { runAgent } from "./agent/agent";

export type CronSummary = {
  sources: { status: RunResult["status"]; itemsNew: number; itemsUpdated: number }[];
  agent: { status: string; storiesPublished: number; issueQueued: boolean };
  deliveriesAttempted: number;
  kev: string;
  ms: number;
};

const KEV_EVERY_MS = 12 * 3600_000;

/**
 * One pass of background work: fetch due sources, send queued newsletter
 * deliveries, and refresh CISA KEV twice a day. Used by POST /api/cron
 * (scheduled from GitHub Actions on hosts without a worker process) and is
 * equivalent to `npm run worker:once` plus a KEV check.
 */
export async function runCronTick(opts: { maxSources?: number; sendBudgetMs?: number } = {}): Promise<CronSummary> {
  const started = Date.now();
  const results = await runDueSources(new Date(), 3, opts.maxSources ?? 8);

  const agentRun = await runAgent({ trigger: "cron", skipFetch: true });

  let deliveriesAttempted = 0;
  const sendDeadline = Date.now() + (opts.sendBudgetMs ?? 120_000);
  while (Date.now() < sendDeadline) {
    const { attempted } = await processSending();
    deliveriesAttempted += attempted;
    if (attempted === 0) break;
  }

  let kev = "skipped (synced recently)";
  const last = await prisma.appSetting.findUnique({ where: { key: "kev.lastSync" } });
  const lastAt = last ? new Date((last.value as { at: string }).at).getTime() : 0;
  if (Date.now() - lastAt > KEV_EVERY_MS) {
    try {
      kev = `synced ${(await syncKev()).count} entries`;
    } catch (e) {
      kev = `failed: ${(e as Error).message.slice(0, 120)}`;
    }
  }

  return {
    sources: results.map((r) => ({ status: r.status, itemsNew: r.itemsNew, itemsUpdated: r.itemsUpdated })),
    agent: { status: agentRun.status, storiesPublished: agentRun.storiesPublished, issueQueued: !!agentRun.issueId },
    deliveriesAttempted,
    kev,
    ms: Date.now() - started,
  };
}
