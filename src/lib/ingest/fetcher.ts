import { Agent, ProxyAgent, request, type Dispatcher } from "undici";
import type { LookupFunction } from "node:net";
import { env } from "../env";
import { resolveAndValidate, SsrfError, systemResolver, parseFetchableUrl, type Resolver } from "./ssrf";

export type FetchErrorKind = "http_error" | "timeout" | "too_large" | "ssrf_rejected" | "network_error" | "blocked";

export class FetchError extends Error {
  constructor(
    public kind: FetchErrorKind,
    message: string,
    public httpStatus?: number,
  ) {
    super(message);
    this.name = "FetchError";
  }
}

export type SafeFetchOptions = {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  retries?: number;
  userAgent?: string;
  etag?: string | null;
  lastModified?: string | null;
  accept?: string;
  /**
   * Test-only escape hatch: exact "host:port" values that may be private
   * (e.g. a local fixture server). Never wire this to env or config.
   */
  unsafeAllowHostsForTests?: string[];
  resolver?: Resolver;
  proxyUrl?: string;
};

export type SafeFetchResult = {
  status: number;
  notModified: boolean;
  body: string;
  finalUrl: string;
  etag?: string;
  lastModified?: string;
  contentType?: string;
};

const DEFAULTS = { timeoutMs: 15_000, maxBytes: 5 * 1024 * 1024, maxRedirects: 3, retries: 1 };

function pinnedAgent(address: string, family: number): Agent {
  const lookup: LookupFunction = (_hostname, options, callback) => {
    if (options && (options as { all?: boolean }).all) {
      (callback as unknown as (e: null, a: { address: string; family: number }[]) => void)(null, [{ address, family }]);
    } else {
      callback(null, address, family);
    }
  };
  return new Agent({ connect: { lookup }, connections: 1, pipelining: 0 });
}

async function readCapped(body: Dispatcher.ResponseData["body"], maxBytes: number): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of body) {
    total += chunk.length;
    if (total > maxBytes) {
      body.destroy();
      throw new FetchError("too_large", `Response exceeded ${Math.round(maxBytes / 1024)} KB limit`);
    }
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function fetchOnce(rawUrl: string, opts: Required<Pick<SafeFetchOptions, "timeoutMs" | "maxBytes" | "maxRedirects">> & SafeFetchOptions): Promise<SafeFetchResult> {
  let current = rawUrl;
  const proxyUrl = opts.proxyUrl === undefined ? env.fetchProxyUrl : opts.proxyUrl || undefined;
  const deadline = AbortSignal.timeout(opts.timeoutMs);

  for (let hop = 0; hop <= opts.maxRedirects; hop++) {
    let dispatcher: Dispatcher;
    if (isTestAllowed(current, opts.unsafeAllowHostsForTests)) {
      dispatcher = new Agent({ connections: 1 });
    } else {
      const { address, family } = await resolveAndValidate(current, opts.resolver ?? systemResolver);
      // Behind an egress proxy the proxy performs the final DNS lookup, so
      // pinning is not possible; we still reject non-public resolutions above.
      dispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : pinnedAgent(address, family);
    }

    try {
      const headers: Record<string, string> = {
        "user-agent": opts.userAgent ?? env.fetchUserAgent,
        accept: opts.accept ?? "application/rss+xml, application/atom+xml, application/xml, text/xml, application/json;q=0.9, */*;q=0.5",
      };
      if (hop === 0 && opts.etag) headers["if-none-match"] = opts.etag;
      if (hop === 0 && opts.lastModified) headers["if-modified-since"] = opts.lastModified;

      const res = await request(current, {
        method: "GET",
        headers,
        dispatcher,
        signal: deadline,
        headersTimeout: opts.timeoutMs,
        bodyTimeout: opts.timeoutMs,
      });

      if (res.statusCode >= 300 && res.statusCode < 400 && res.statusCode !== 304) {
        await res.body.dump();
        const loc = res.headers.location;
        const location = Array.isArray(loc) ? loc[0] : loc;
        if (!location) throw new FetchError("http_error", `Redirect ${res.statusCode} without Location`, res.statusCode);
        if (hop === opts.maxRedirects) throw new FetchError("http_error", `Too many redirects (>${opts.maxRedirects})`, res.statusCode);
        current = new URL(location, current).toString();
        continue;
      }

      const h = (name: string) => {
        const v = res.headers[name];
        return Array.isArray(v) ? v[0] : v;
      };

      if (res.statusCode === 304) {
        await res.body.dump();
        return { status: 304, notModified: true, body: "", finalUrl: current };
      }
      if (res.statusCode >= 400) {
        await res.body.dump();
        throw new FetchError("http_error", `HTTP ${res.statusCode}`, res.statusCode);
      }
      const declared = Number(h("content-length") ?? 0);
      if (declared > opts.maxBytes) {
        await res.body.dump().catch(() => {});
        throw new FetchError("too_large", `Declared size ${declared} exceeds limit`);
      }
      const body = await readCapped(res.body, opts.maxBytes);
      return {
        status: res.statusCode,
        notModified: false,
        body,
        finalUrl: current,
        etag: h("etag"),
        lastModified: h("last-modified"),
        contentType: h("content-type"),
      };
    } catch (e) {
      if (e instanceof FetchError || e instanceof SsrfError) throw e;
      const err = e as Error & { code?: string; name?: string };
      if (err.name === "TimeoutError" || err.name === "AbortError" || err.code === "UND_ERR_HEADERS_TIMEOUT" || err.code === "UND_ERR_BODY_TIMEOUT") {
        throw new FetchError("timeout", `Timed out after ${opts.timeoutMs} ms`);
      }
      throw new FetchError("network_error", err.message || "Network error");
    } finally {
      dispatcher.close().catch(() => {});
    }
  }
  throw new FetchError("http_error", "Too many redirects");
}

function isTestAllowed(raw: string, allow?: string[]): boolean {
  if (!allow?.length) return false;
  const u = new URL(raw);
  return (u.protocol === "http:" || u.protocol === "https:") && allow.includes(u.host);
}

/** Fetch a URL with SSRF protection, timeouts, size cap, redirect limit and a retry for transient failures. */
export async function safeFetch(url: string, options: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const opts = { ...DEFAULTS, ...options };
  if (!isTestAllowed(url, opts.unsafeAllowHostsForTests)) {
    try {
      parseFetchableUrl(url);
    } catch (e) {
      throw new FetchError("ssrf_rejected", (e as Error).message);
    }
  }
  let lastErr: unknown;
  for (let attempt = 0; attempt <= opts.retries; attempt++) {
    try {
      return await fetchOnce(url, opts);
    } catch (e) {
      if (e instanceof SsrfError) throw new FetchError("ssrf_rejected", e.message);
      lastErr = e;
      const transient =
        e instanceof FetchError &&
        (e.kind === "timeout" || e.kind === "network_error" || (e.kind === "http_error" && (e.httpStatus ?? 0) >= 500));
      if (!transient || attempt === opts.retries) break;
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
  }
  throw lastErr;
}
