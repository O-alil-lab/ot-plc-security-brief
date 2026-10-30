import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { adminExists, getSession } from "@/lib/auth/session";
import { loginAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getSession()) redirect("/admin");
  const { error } = await searchParams;
  const hasAdmin = await adminExists();
  return (
    <div className="flex min-h-screen items-center justify-center bg-panel px-4">
      <div className="w-full max-w-sm rounded-lg border border-line bg-white p-7">
        <h1 className="text-2xl font-bold">Editorial dashboard</h1>
        {!hasAdmin ? (
          <div className="mt-4 space-y-3 text-sm">
            <p>No admin account exists yet, so sign-in is disabled.</p>
            <p>Create one from a terminal in the project folder:</p>
            <pre className="rounded bg-panel p-3"><code>npm run admin:create</code></pre>
          </div>
        ) : (
          <form action={loginAction} className="mt-5 space-y-4">
            {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-danger">{error}</p>}
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Email</span>
              <input name="email" type="email" required autoComplete="username" className="field" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Password</span>
              <input name="password" type="password" required autoComplete="current-password" className="field" />
            </label>
            <button className="btn btn-primary w-full justify-center">Sign in</button>
          </form>
        )}
      </div>
    </div>
  );
}
