import { NextResponse } from "next/server";
import { confirmSubscription } from "@/lib/subscribers/service";
import { env } from "@/lib/env";

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const token = String(form?.get("token") ?? "");
  const result = await confirmSubscription(token);
  return NextResponse.redirect(`${env.baseUrl}/subscribe/confirm?status=${result}`, 303);
}
