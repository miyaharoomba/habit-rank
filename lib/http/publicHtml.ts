import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP } from "node:net";

const blockedV4 = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10],
  ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24],
  ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) blockedV4.addSubnet(address, prefix, "ipv4");
const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");
const blockedV6 = new BlockList();
for (const [address, prefix] of [
  ["2001::", 32], ["2001:db8::", 32], ["2001:10::", 28],
  ["2001:20::", 28], ["2002::", 16],
] as const) blockedV6.addSubnet(address, prefix, "ipv6");

export function isPublicAddress(address: string) {
  const family = isIP(address);
  if (family === 4) return !blockedV4.check(address, "ipv4");
  if (family === 6) return globalV6.check(address, "ipv6") && !blockedV6.check(address, "ipv6");
  return false;
}

export function normalizePublicHttpUrl(input: string): URL {
  if (input.length > 2048) throw new Error("invalid_url");
  let url: URL;
  try { url = new URL(input); } catch { throw new Error("invalid_url"); }
  if (
    !["http:", "https:"].includes(url.protocol) || url.username || url.password ||
    (url.port && url.port !== (url.protocol === "https:" ? "443" : "80"))
  ) throw new Error("invalid_url");
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase().replace(/\.$/, "");
  if (
    host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") ||
    host.endsWith(".internal") || (isIP(host) && !isPublicAddress(host))
  ) throw new Error("blocked_host");
  url.hash = "";
  return url;
}

type Address = { address: string; family: number };
type HtmlResponse = { status: number; location?: string; contentType: string; html: string };
type Transport = (url: URL, address: Address, signal: AbortSignal) => Promise<HtmlResponse>;
const MAX_HTML_BYTES = 512 * 1024;

// Pin the checked IP while retaining the URL hostname for Host and TLS/SNI.
// No second DNS lookup, pooled connection, or implicit redirect is permitted.
const requestPinned: Transport = (url, address, signal) => new Promise((resolve, reject) => {
  const request = url.protocol === "https:" ? httpsRequest : httpRequest;
  const requestOptions: import("node:http").RequestOptions & { autoSelectFamily: boolean } = {
    agent: false,
    autoSelectFamily: false,
    signal,
    lookup: (_hostname, _options, done) => done(null, address.address, address.family),
    headers: {
      "User-Agent": "habitbase-link-preview/2.0",
      Accept: "text/html,application/xhtml+xml",
      "Accept-Encoding": "identity",
    },
  };
  const req = request(url, requestOptions, (res) => {
    const status = res.statusCode ?? 0;
    if ([301, 302, 303, 307, 308].includes(status)) {
      res.resume();
      resolve({ status, location: res.headers.location, contentType: "", html: "" });
      return;
    }
    const contentType = String(res.headers["content-type"] ?? "");
    if (status < 200 || status >= 300 || !/\b(?:text\/html|application\/xhtml\+xml)\b/i.test(contentType)) {
      res.resume();
      reject(new Error(status < 200 || status >= 300 ? "HTTP " + status : "not_html"));
      return;
    }
    const encoding = res.headers["content-encoding"];
    if ((encoding && encoding !== "identity") || Number(res.headers["content-length"] ?? 0) > MAX_HTML_BYTES) {
      res.destroy();
      reject(new Error("response_too_large_or_encoded"));
      return;
    }
    const chunks: Buffer[] = [];
    let bytes = 0;
    res.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > MAX_HTML_BYTES) { res.destroy(); reject(new Error("response_too_large")); }
      else chunks.push(chunk);
    });
    res.on("end", () => resolve({ status, contentType, html: Buffer.concat(chunks).toString("utf8") }));
    res.on("error", reject);
  });
  req.on("error", reject);
  req.end();
});

export async function fetchPublicHtml(input: string, options: {
  resolve?: (hostname: string) => Promise<Address[]>;
  transport?: Transport;
  timeoutMs?: number;
} = {}) {
  const signal = AbortSignal.timeout(options.timeoutMs ?? 5000);
  const resolve = options.resolve ?? ((hostname: string) => dnsLookup(hostname, { all: true, verbatim: true }));
  const transport = options.transport ?? requestPinned;
  let url = normalizePublicHttpUrl(input);
  for (let hop = 0; hop <= 3; hop++) {
    signal.throwIfAborted();
    const hostname = url.hostname.replace(/^\[|\]$/g, "");
    const addresses = await Promise.race([
      isIP(hostname) ? Promise.resolve([{ address: hostname, family: isIP(hostname) }]) : resolve(hostname),
      new Promise<never>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("timeout")), { once: true });
      }),
    ]);
    if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) throw new Error("blocked_host");
    const response = await transport(url, addresses[0], signal);
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (!response.location || hop === 3) throw new Error("too_many_redirects");
      url = normalizePublicHttpUrl(new URL(response.location, url).toString());
      continue;
    }
    if (Buffer.byteLength(response.html, "utf8") > MAX_HTML_BYTES) throw new Error("response_too_large");
    return { finalUrl: url.toString(), html: response.html };
  }
  throw new Error("too_many_redirects");
}
