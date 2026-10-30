import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { POST } from "@/app/api/cron/route";
import { GET as health } from "@/app/api/health/route";
import { resetDb } from "../helpers";

const SECRET = "c".repeat(48);
const call = (auth?: string) => POST(new Request("http://localhost/api/cron", { method: "POST", headers: auth ? { authorization: auth } : {} }));

beforeEach(async () => {
  await resetDb();
  // Mark KEV as freshly synced so the test never touches the network.
  await prisma.appSetting.create({ data: { key: "kev.lastSync", value: { at: new Date().toISOString(), count: 0 } } });
});
afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe("POST /api/cron", () => {
  it("is disabled when CRON_SECRET is not set (or too short)", async () => {
    expect((await call(`Bearer ${SECRET}`)).status).toBe(503);
    process.env.CRON_SECRET = "short";
    expect((await call("Bearer short")).status).toBe(503);
  });

  it("rejects missing or wrong tokens without doing any work", async () => {
    process.env.CRON_SECRET = SECRET;
    expect((await call()).status).toBe(401);
    expect((await call(`Bearer ${"x".repeat(48)}`)).status).toBe(401);
    expect((await call(SECRET)).status).toBe(401);
    expect(await prisma.fetchRun.count()).toBe(0);
  });

  it("runs a tick with the right token", async () => {
    process.env.CRON_SECRET = SECRET;
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { sources: unknown[]; deliveriesAttempted: number; kev: string };
    expect(body.sources).toEqual([]);
    expect(body.deliveriesAttempted).toBe(0);
    expect(body.kev).toMatch(/skipped/);
  });
});

describe("GET /api/health", () => {
  it("reports database connectivity", async () => {
    const res = await health();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
