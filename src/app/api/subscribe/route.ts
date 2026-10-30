import { NextResponse } from "next/server";
import { z } from "zod";
import { subscribe } from "@/lib/subscribers/service";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { errorResponse, readJson } from "@/lib/http";

const body = z.object({
  email: z.string().max(254),
  consent: z.boolean(),
  website: z.string().max(200).optional().nullable(),
});

export async function POST(req: Request) {
  const ip = clientIp(req.headers);
  if (!rateLimit(`subscribe:${ip}`, 5, 10 * 60_000)) {
    return NextResponse.json({ error: "Too many attempts. Please wait a few minutes and try again." }, { status: 429 });
  }
  try {
    const data = body.parse(await readJson(req));
    if (data.website) {
      // Honeypot filled: pretend success, do nothing.
      return NextResponse.json({ message: "Thanks. If this address can be subscribed, we've sent a confirmation link." });
    }
    const res = await subscribe({ email: data.email, consent: data.consent, signupSource: "website" });
    return NextResponse.json(res);
  } catch (e) {
    return errorResponse(e);
  }
}
