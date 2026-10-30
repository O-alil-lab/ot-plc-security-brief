import { NextResponse } from "next/server";
import { createSubmission } from "@/lib/submissions";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { errorResponse, readJson } from "@/lib/http";

export async function POST(req: Request) {
  const ip = clientIp(req.headers);
  if (!rateLimit(`submit:${ip}`, 5, 60 * 60_000)) {
    return NextResponse.json({ error: "Too many submissions from your network. Please try again later." }, { status: 429 });
  }
  try {
    const input = (await readJson(req)) as Record<string, unknown>;
    if (typeof input?.website === "string" && input.website) return NextResponse.json({ ok: true });
    await createSubmission(
      {
        url: String(input?.url ?? ""),
        note: typeof input?.note === "string" ? input.note : undefined,
        contactEmail: typeof input?.contactEmail === "string" ? input.contactEmail : undefined,
      },
      ip,
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
