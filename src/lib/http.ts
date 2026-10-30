import { NextResponse } from "next/server";
import { ZodError } from "zod";

/** Turn a thrown error into a safe JSON response. Never leaks stack traces or secrets. */
export function errorResponse(e: unknown, fallback = "Something went wrong. Try again later.") {
  if (e instanceof ZodError) {
    return NextResponse.json({ error: e.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  console.error("[api]", (e as Error)?.name, (e as Error)?.message?.slice(0, 200));
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export async function readJson(req: Request, maxBytes = 16_384): Promise<unknown> {
  const text = await req.text();
  if (text.length > maxBytes) throw new ZodError([{ code: "custom", path: [], message: "Request too large", input: null }]);
  try {
    return JSON.parse(text);
  } catch {
    throw new ZodError([{ code: "custom", path: [], message: "Invalid JSON", input: null }]);
  }
}
