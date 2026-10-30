import { describe, it, expect } from "vitest";
import { isPublicIp, parseFetchableUrl, resolveAndValidate, SsrfError, type Resolver } from "@/lib/ingest/ssrf";

const fixed = (...addrs: string[]): Resolver => async () => addrs.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));

describe("SSRF guard", () => {
  it.each([
    "127.0.0.1", "10.0.0.5", "172.16.3.4", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0",
    "224.0.0.1", "255.255.255.255", "::1", "fe80::1", "fc00::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "64:ff9b::a00:1",
  ])("rejects non-public address %s", (ip) => {
    expect(isPublicIp(ip)).toBe(false);
  });

  it.each(["8.8.8.8", "23.210.150.135", "2606:4700:4700::1111"])("allows public address %s", (ip) => {
    expect(isPublicIp(ip)).toBe(true);
  });

  it.each([
    "file:///etc/passwd", "gopher://x", "ftp://example.com/feed", "http://localhost/feed", "http://foo.localhost/",
    "http://metadata.google.internal/", "http://user:pass@example.com/", "http://example.com:22/", "not a url",
  ])("rejects unsafe URL %s", (u) => {
    expect(() => parseFetchableUrl(u)).toThrow(SsrfError);
  });

  it("rejects literal private and metadata IPs in URLs", async () => {
    await expect(resolveAndValidate("http://169.254.169.254/latest/meta-data")).rejects.toThrow(SsrfError);
    await expect(resolveAndValidate("http://[::1]/")).rejects.toThrow(SsrfError);
    await expect(resolveAndValidate("http://[::ffff:7f00:1]/")).rejects.toThrow(SsrfError);
  });

  it("rejects hostnames that resolve to private addresses", async () => {
    await expect(resolveAndValidate("https://evil.example/", fixed("10.1.2.3"))).rejects.toThrow(/non-public/);
  });

  it("rejects DNS rebinding style answers that mix public and private IPs", async () => {
    await expect(resolveAndValidate("https://rebind.example/", fixed("93.184.216.34", "127.0.0.1"))).rejects.toThrow(SsrfError);
  });

  it("returns the vetted address to pin the connection to", async () => {
    const r = await resolveAndValidate("https://ok.example/feed", fixed("93.184.216.34"));
    expect(r.address).toBe("93.184.216.34");
  });
});
