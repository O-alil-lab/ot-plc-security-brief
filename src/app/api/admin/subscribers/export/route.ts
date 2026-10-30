import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireAdminRead, UnauthorizedError } from "@/lib/auth/session";

function csv(v: string | null | undefined) {
  const s = v ?? "";
  // Neutralise spreadsheet formula injection.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

export async function GET() {
  let session;
  try {
    session = await requireAdminRead();
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    throw e;
  }
  const subs = await prisma.subscriber.findMany({ orderBy: { createdAt: "asc" } });
  const rows = [
    "email,status,signup_source,consent_at,consent_text_version,confirmed_at,unsubscribed_at",
    ...subs.map((s) =>
      [s.email, s.status, s.signupSource, s.consentAt.toISOString(), s.consentTextVersion, s.confirmedAt?.toISOString(), s.unsubscribedAt?.toISOString()].map(csv).join(","),
    ),
  ];
  await audit(session.email, "subscribers.export", "subscriber", null, { rows: subs.length });
  return new Response(rows.join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="subscribers-${new Date().toISOString().slice(0, 10)}.csv"`,
      "cache-control": "no-store",
    },
  });
}
