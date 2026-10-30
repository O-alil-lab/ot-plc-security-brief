import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import { safeFetch, FetchError } from "@/lib/ingest/fetcher";

let server: Server;
let host = "";

beforeAll(async () => {
  server = createServer((req, res) => {
    switch (req.url) {
      case "/ok": res.writeHead(200, { "content-type": "application/rss+xml", etag: '"v1"' }); return res.end(readFileSync("tests/fixtures/feeds/rss-basic.xml"));
      case "/etag": if (req.headers["if-none-match"] === '"v1"') { res.writeHead(304); return res.end(); } res.writeHead(200, { etag: '"v1"' }); return res.end("<rss/>");
      case "/403": res.writeHead(403); return res.end("Forbidden");
      case "/500": res.writeHead(500); return res.end("err");
      case "/slow": setTimeout(() => { res.writeHead(200); res.end("late"); }, 3000); return;
      case "/huge": res.writeHead(200); { const chunk = Buffer.alloc(64 * 1024, 97); let sent = 0; const pump = () => { while (sent < 3 * 1024 * 1024) { sent += chunk.length; if (!res.write(chunk)) return res.once("drain", pump); } res.end(); }; pump(); } return;
      case "/loop": res.writeHead(302, { location: "/loop" }); return res.end();
      case "/to-metadata": res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" }); return res.end();
      case "/to-private": res.writeHead(301, { location: "http://10.0.0.1/feed" }); return res.end();
      default: res.writeHead(404); return res.end();
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  host = `127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const opts = () => ({ unsafeAllowHostsForTests: [host], retries: 0, proxyUrl: "" });
const kindOf = async (p: Promise<unknown>) => { try { await p; return "ok"; } catch (e) { return e instanceof FetchError ? `${e.kind}${e.httpStatus ? `:${e.httpStatus}` : ""}` : `other:${(e as Error).message}`; } };

describe("safe fetcher", () => {
  it("fetches a feed and returns caching headers", async () => {
    const r = await safeFetch(`http://${host}/ok`, opts());
    expect(r.status).toBe(200);
    expect(r.etag).toBe('"v1"');
    expect(r.body).toContain("<rss");
  });

  it("supports conditional requests (304)", async () => {
    const r = await safeFetch(`http://${host}/etag`, { ...opts(), etag: '"v1"' });
    expect(r.notModified).toBe(true);
  });

  it("reports HTTP 403 as an error, not as an empty feed", async () => {
    expect(await kindOf(safeFetch(`http://${host}/403`, opts()))).toBe("http_error:403");
  });

  it("retries transient 5xx and then fails", async () => {
    expect(await kindOf(safeFetch(`http://${host}/500`, { ...opts(), retries: 1 }))).toBe("http_error:500");
  });

  it("times out slow responses", async () => {
    expect(await kindOf(safeFetch(`http://${host}/slow`, { ...opts(), timeoutMs: 500 }))).toBe("timeout");
  });

  it("aborts oversize responses", async () => {
    expect(await kindOf(safeFetch(`http://${host}/huge`, { ...opts(), maxBytes: 1024 * 1024 }))).toBe("too_large");
  });

  it("stops redirect loops", async () => {
    expect(await kindOf(safeFetch(`http://${host}/loop`, opts()))).toBe("http_error:302");
  });

  it("re-validates every redirect hop (metadata and private targets rejected)", async () => {
    expect(await kindOf(safeFetch(`http://${host}/to-metadata`, opts()))).toBe("ssrf_rejected");
    expect(await kindOf(safeFetch(`http://${host}/to-private`, opts()))).toBe("ssrf_rejected");
  });

  it("rejects loopback targets when not explicitly allowed", async () => {
    expect(await kindOf(safeFetch(`http://${host}/ok`, { retries: 0, proxyUrl: "" }))).toBe("ssrf_rejected");
    expect(await kindOf(safeFetch(`http://localhost/feed`, { retries: 0, proxyUrl: "" }))).toBe("ssrf_rejected");
  });
});
