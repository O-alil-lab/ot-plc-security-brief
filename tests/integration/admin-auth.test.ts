import { describe, it, expect, beforeEach, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// A controllable cookie jar standing in for next/headers.
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (k: string) => (jar.has(k) ? { name: k, value: jar.get(k)! } : undefined),
    set: (k: string, v: string) => void jar.set(k, v),
    delete: (k: string) => void jar.delete(k),
  }),
  headers: async () => new Headers({ "x-forwarded-for": "9.9.9.9" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { prisma } = await import("@/lib/db");
const actions = await import("@/app/admin/actions");
const { createSession, SESSION_COOKIE, getSession } = await import("@/lib/auth/session");
const { hashPassword } = await import("@/lib/auth/password");
const exportRoute = await import("@/app/api/admin/subscribers/export/route");
const { resetDb, makeSource } = await import("../helpers");

const PUBLIC_ACTIONS = new Set(["loginAction", "logoutAction"]);

function redirectTarget(e: unknown): string | null {
  const digest = (e as { digest?: string })?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT") ? digest.split(";")[2] : null;
}

async function callAction(fn: (fd: FormData) => Promise<unknown>, fd: FormData) {
  try {
    await fn(fd);
    return "returned";
  } catch (e) {
    return redirectTarget(e) ?? `threw:${(e as Error).message}`;
  }
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

beforeEach(async () => {
  await resetDb();
  jar.clear();
});

describe("admin authorization", () => {
  const protectedActions = Object.entries(actions).filter(([name, fn]) => typeof fn === "function" && !PUBLIC_ACTIONS.has(name)) as [string, (fd: FormData) => Promise<unknown>][];

  it("discovers the admin actions programmatically", () => {
    expect(protectedActions.length).toBeGreaterThanOrEqual(20);
  });

  it.each(protectedActions.map(([n, f]) => [n, f] as const))("%s rejects unauthenticated calls without side effects", async (_name, fn) => {
    const src = await makeSource();
    const fd = new FormData();
    fd.set("id", src.id);
    fd.set("itemId", "x");
    fd.set("to", "a@example.com");
    const before = await prisma.auditEvent.count();
    expect(await callAction(fn, fd)).toBe("/admin/login");
    expect(await prisma.auditEvent.count()).toBe(before);
    expect((await prisma.source.findUniqueOrThrow({ where: { id: src.id } })).enabled).toBe(true);
  });

  it("rejects a signed-in admin whose request lacks the CSRF token", async () => {
    const admin = await prisma.admin.create({ data: { email: "ed@example.com", passwordHash: await hashPassword("a-long-password-123") } });
    await createSession(admin.id);
    const src = await makeSource();
    const fd = new FormData();
    fd.set("id", src.id);
    expect(await callAction(actions.toggleSourceAction, fd)).toBe("/admin/login");
    fd.set("csrf", "wrong");
    expect(await callAction(actions.toggleSourceAction, fd)).toBe("/admin/login");
    expect((await prisma.source.findUniqueOrThrow({ where: { id: src.id } })).enabled).toBe(true);

    fd.set("csrf", (await getSession())!.csrf);
    const target = await callAction(actions.toggleSourceAction, fd);
    expect(target).toMatch(/^\/admin\/sources\?msg=/);
    expect((await prisma.source.findUniqueOrThrow({ where: { id: src.id } })).enabled).toBe(false);
  });

  it("expired or forged session cookies are rejected", async () => {
    jar.set(SESSION_COOKIE, "forged");
    expect(await getSession()).toBeNull();
    const admin = await prisma.admin.create({ data: { email: "e2@example.com", passwordHash: "x" } });
    await createSession(admin.id);
    await prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await getSession()).toBeNull();
  });

  it("login fails with the same message for unknown email and wrong password", async () => {
    await prisma.admin.create({ data: { email: "ed@example.com", passwordHash: await hashPassword("a-long-password-123") } });
    const attempt = async (email: string, password: string) => {
      const fd = new FormData();
      fd.set("email", email);
      fd.set("password", password);
      return callAction(actions.loginAction, fd);
    };
    const unknown = await attempt("nobody@example.com", "whatever-password");
    const wrong = await attempt("ed@example.com", "wrong-password-000");
    expect(unknown).toBe(wrong);
    expect(unknown).toMatch(/^\/admin\/login\?error=/);
    expect(await attempt("ed@example.com", "a-long-password-123")).toBe("/admin");
    expect(jar.get(SESSION_COOKIE)).toBeTruthy();
  });

  it("every admin page calls requireAdminPage (except login)", () => {
    const pages = walk("src/app/admin").filter((p) => p.endsWith("page.tsx") && !p.includes(`${join("admin", "login")}`));
    expect(pages.length).toBeGreaterThanOrEqual(15);
    for (const p of pages) expect(readFileSync(p, "utf8"), p).toMatch(/await requireAdminPage\(\)/);
  });

  it("every admin API route checks the session", async () => {
    const routes = walk("src/app/api/admin").filter((p) => p.endsWith("route.ts"));
    expect(routes.length).toBeGreaterThanOrEqual(1);
    for (const p of routes) expect(readFileSync(p, "utf8"), p).toMatch(/requireAdmin(Read|Action)\(/);
    const res = await exportRoute.GET();
    expect(res.status).toBe(401);
  });
});
