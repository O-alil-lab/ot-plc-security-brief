/**
 * Background worker: polls due sources and sends queued newsletter deliveries.
 *   npm run worker            (long-running)
 *   npm run worker -- --once  (single pass, useful for cron or debugging)
 *
 * Uses the database as the queue (FetchRun / NewsletterDelivery rows), so a
 * crashed worker resumes where it left off. Run exactly one worker instance.
 */
import { prisma } from "../src/lib/db";
import { runDueSources } from "../src/lib/ingest/ingest";
import { processSending } from "../src/lib/newsletter/send";
import { syncKev } from "../src/lib/kev";

const INGEST_EVERY_MS = 5 * 60_000; // check for due sources every 5 min
const SEND_EVERY_MS = 15_000;
const KEV_EVERY_MS = 12 * 3600_000;

let stopping = false;

async function ingestTick() {
  const results = await runDueSources();
  for (const r of results) {
    console.info(`[worker] run ${r.runId}: ${r.status} seen=${r.itemsSeen} new=${r.itemsNew} updated=${r.itemsUpdated}${r.error ? ` error="${r.error}"` : ""}`);
  }
}

async function sendTick() {
  const { attempted } = await processSending();
  if (attempted) console.info(`[worker] newsletter deliveries attempted: ${attempted}`);
}

async function kevTick() {
  try {
    const r = await syncKev();
    console.info(`[worker] KEV synced: ${r.count} entries`);
  } catch (e) {
    console.warn(`[worker] KEV sync failed: ${(e as Error).message}`);
  }
}

function every(ms: number, fn: () => Promise<void>, name: string) {
  let running = false;
  const tick = async () => {
    if (running || stopping) return;
    running = true;
    try {
      await fn();
    } catch (e) {
      console.error(`[worker] ${name} failed: ${(e as Error).message}`);
    } finally {
      running = false;
    }
  };
  void tick();
  return setInterval(tick, ms);
}

async function main() {
  if (process.argv.includes("--once")) {
    await ingestTick();
    await sendTick();
    return;
  }
  console.info("[worker] started");
  const timers = [every(INGEST_EVERY_MS, ingestTick, "ingest"), every(SEND_EVERY_MS, sendTick, "send"), every(KEV_EVERY_MS, kevTick, "kev")];
  const stop = async () => {
    stopping = true;
    timers.forEach(clearInterval);
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
