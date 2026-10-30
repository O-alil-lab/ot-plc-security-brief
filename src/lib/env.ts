/**
 * Centralised, validated access to environment configuration.
 * Server-only: never import from client components.
 */
function read(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : undefined;
}

export const env = {
  get baseUrl(): string {
    // RENDER_EXTERNAL_URL is set automatically on Render web services.
    return (read("APP_BASE_URL") ?? read("RENDER_EXTERNAL_URL") ?? "http://localhost:3000").replace(/\/+$/, "");
  },
  get appSecret(): string {
    const s = read("APP_SECRET");
    if (!s || s.length < 32) {
      if (process.env.NODE_ENV === "production") {
        throw new Error("APP_SECRET must be set (32+ chars) in production");
      }
      return "dev-only-insecure-secret-change-me-0000000000";
    }
    return s;
  },
  get fetchUserAgent(): string {
    return read("FETCH_USER_AGENT") ?? "OT-PLC-Security-Brief/0.1 (feed reader)";
  },
  get fetchProxyUrl(): string | undefined {
    return read("FETCH_PROXY_URL");
  },
  get emailProvider(): "console" | "smtp" | "resend" {
    const p = read("EMAIL_PROVIDER") ?? "console";
    if (p === "smtp" || p === "resend") return p;
    return "console";
  },
  get emailFrom(): string {
    return read("EMAIL_FROM") ?? "OT & PLC Security Brief <brief@localhost>";
  },
  get emailReplyTo(): string | undefined {
    return read("EMAIL_REPLY_TO");
  },
  /** Shared secret for POST /api/cron. When unset, the endpoint is disabled. */
  get cronSecret(): string | undefined {
    const s = read("CRON_SECRET");
    return s && s.length >= 32 ? s : undefined;
  },
  get aiProvider(): "none" | "anthropic" {
    return read("AI_PROVIDER") === "anthropic" ? "anthropic" : "none";
  },
  read,
};
