import { NextResponse } from "next/server";
import { unsubscribe } from "@/lib/subscribers/service";
import { env } from "@/lib/env";

/**
 * POST handles both the visible unsubscribe page (form field "token") and
 * RFC 8058 one-click unsubscribe from mail clients (token in the query string,
 * body "List-Unsubscribe=One-Click").
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  let token = url.searchParams.get("token") ?? "";
  const ctype = req.headers.get("content-type") ?? "";
  let fromPage = false;
  if (ctype.includes("form")) {
    const form = await req.formData().catch(() => null);
    const formToken = form?.get("token");
    if (typeof formToken === "string" && formToken) {
      token = formToken;
      fromPage = true;
    }
  }
  const result = await unsubscribe(token);
  if (fromPage) {
    return NextResponse.redirect(`${env.baseUrl}/unsubscribe?status=${result === "unsubscribed" ? "done" : "invalid"}`, 303);
  }
  return NextResponse.json({ status: result }, { status: result === "unsubscribed" ? 200 : 400 });
}

/** A plain GET never changes state; it shows the confirmation page. */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  return NextResponse.redirect(`${env.baseUrl}/unsubscribe?token=${encodeURIComponent(token)}`, 303);
}
