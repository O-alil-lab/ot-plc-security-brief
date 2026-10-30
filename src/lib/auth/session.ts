import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "../db";
import { hashToken, newToken, safeEqual } from "../crypto";

export const SESSION_COOKIE = "brief_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export type AdminSession = { adminId: string; email: string; csrf: string; sessionId: string };

export async function createSession(adminId: string): Promise<void> {
  const token = newToken();
  const csrfSecret = newToken();
  await prisma.session.create({
    data: { tokenHash: hashToken(token), csrfSecret, adminId, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  jar.delete(SESSION_COOKIE);
}

export async function getSession(): Promise<AdminSession | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const s = await prisma.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { admin: true } });
  if (!s || s.expiresAt < new Date()) return null;
  return { adminId: s.adminId, email: s.admin.email, csrf: s.csrfSecret, sessionId: s.id };
}

/** For admin pages: redirect to login if not signed in. */
export async function requireAdminPage(): Promise<AdminSession> {
  const s = await getSession();
  if (!s) redirect("/admin/login");
  return s;
}

/**
 * For admin server actions and API routes. Throws if not signed in or if
 * the CSRF token is missing/wrong (defence in depth on top of Next.js's
 * built-in Origin check for server actions).
 */
export async function requireAdminAction(formData?: FormData | null, csrfHeader?: string | null): Promise<AdminSession> {
  const s = await getSession();
  if (!s) throw new UnauthorizedError();
  const provided = (formData?.get("csrf") as string | null) ?? csrfHeader ?? "";
  if (!provided || !safeEqual(provided, s.csrf)) throw new UnauthorizedError("Invalid CSRF token");
  return s;
}

/** For read-only admin API routes (GET). */
export async function requireAdminRead(): Promise<AdminSession> {
  const s = await getSession();
  if (!s) throw new UnauthorizedError();
  return s;
}

export async function adminExists(): Promise<boolean> {
  return (await prisma.admin.count()) > 0;
}
