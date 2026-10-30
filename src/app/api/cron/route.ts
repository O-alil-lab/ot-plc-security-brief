import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/crypto";
import { runCronTick } from "@/lib/cron";

export const dynamic = "force-dynamic";
export const maxDuration = 900;

/**
 * Background work trigger for hosts without a long-running worker.
 * Requires `Authorization: Bearer <CRON_SECRET>`. Disabled when CRON_SECRET is unset.
 */
export async function POST(req: Request) {
  const secret = env.cronSecret;
  if (!secret) return NextResponse.json({ error: "Cron endpoint is disabled (CRON_SECRET not set)." }, { status: 503 });
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || !safeEqual(token, secret)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await runCronTick());
  } catch (e) {
    console.error("[cron]", (e as Error).message.slice(0, 300));
    return NextResponse.json({ error: "Cron run failed. Check the server log." }, { status: 500 });
  }
}
