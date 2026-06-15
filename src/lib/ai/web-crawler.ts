import { createHash } from "node:crypto";
import https from "node:https";
import http from "node:http";

import { logger } from "@/lib/logger";
import { assertPublicHttpUrl } from "@/lib/security";
import { extractLinks, extractTitle, htmlToText } from "@/lib/ai/html-extract";

// Hard safety ceilings — user-supplied limits are clamped to these regardless
// of plan, to bound cost and abuse.
export const MAX_CRAWL_DEPTH = 3;
export const MAX_CRAWL_PAGES = 50;
const PER_FETCH_TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_REDIRECTS = 5;
const TOTAL_TIME_BUDGET_MS = 120_000;
const MIN_TEXT_LENGTH = 40; // skip near-empty pages

export const CRAWLER_USER_AGENT =
  process.env.CRAWLER_USER_AGENT ?? "HeitaBot/1.0 (+https://heita.co.za/bot)";

export type CrawledPage = {
  url: string;
  title: string | null;
  text: string;
  contentHash: string;
};

export type CrawlResult = {
  pages: CrawledPage[];
  pagesVisited: number;
  truncated: boolean; // hit a page/time cap before exhausting the frontier
};

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function normalizeForVisit(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    // Treat trailing-slash and non-slash roots as the same page.
    if (u.pathname !== "/" && u.pathname.endsWith("/")) {
      u.pathname = u.pathname.replace(/\/+$/, "");
    }
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * Fetch a URL using a pinned connection that bypasses DNS resolution and
 * connects directly to the already-validated IP addresses. This closes the
 * DNS-rebinding TOCTOU window: even if a malicious DNS server changes its
 * response between validation and fetch, the connection is pinned to the
 * previously-resolved public IPs.
 */
function fetchWithPinnedIp(
  url: string,
  resolvedIps: string[],
  opts: {
    method?: string;
    headers?: Record<string, string>;
    signal?: AbortSignal;
  }
): Promise<{ status: number; headers: Headers; text: () => Promise<string> }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === "https:";
    const port = parsed.port ? parseInt(parsed.port, 10) : (isHttps ? 443 : 80);

    const ip = resolvedIps[0];
    if (!ip) {
      reject(new Error("No resolved IPs available for pinned connection"));
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pinnedLookup = (_hostname: string, _opts: any, cb: (err: Error | null, address: string, family: number) => void) => {
      cb(null, ip, ip.includes(":") ? 6 : 4);
    };

    const agent = isHttps
      ? new https.Agent({ lookup: pinnedLookup })
      : new http.Agent({ lookup: pinnedLookup });

    const mod = isHttps ? https : http;
    const requestOpts: https.RequestOptions | http.RequestOptions = {
      hostname: parsed.hostname,
      port,
      path: parsed.pathname + parsed.search,
      method: opts.method ?? "GET",
      headers: { ...opts.headers, host: parsed.hostname },
      agent,
      signal: opts.signal
    };
    if (isHttps) {
      (requestOpts as https.RequestOptions).rejectUnauthorized = true;
    }
    const req = mod.request(requestOpts, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        resolve({
          status: res.statusCode ?? 0,
          headers: new Headers(res.headers as Record<string, string>),
          text: async () => body
        });
      });
      res.on("error", reject);
    });
    req.on("error", reject);
    req.end();
  });
}

/** Minimal robots.txt matcher for our User-Agent (falls back to `*`). */
class RobotsRules {
  private readonly disallow: string[];

  private constructor(disallow: string[]) {
    this.disallow = disallow;
  }

  static parse(body: string): RobotsRules {
    const lines = body.split(/\r?\n/);
    const groups: { agents: string[]; disallow: string[] }[] = [];
    let current: { agents: string[]; disallow: string[] } | null = null;
    let lastWasAgent = false;

    for (const rawLine of lines) {
      const line = rawLine.replace(/#.*$/, "").trim();
      if (!line) continue;
      const idx = line.indexOf(":");
      if (idx === -1) continue;
      const field = line.slice(0, idx).trim().toLowerCase();
      const value = line.slice(idx + 1).trim();

      if (field === "user-agent") {
        if (!current || !lastWasAgent) {
          current = { agents: [], disallow: [] };
          groups.push(current);
        }
        current.agents.push(value.toLowerCase());
        lastWasAgent = true;
      } else if (field === "disallow" && current) {
        if (value) current.disallow.push(value);
        lastWasAgent = false;
      } else {
        lastWasAgent = false;
      }
    }

    const ua = CRAWLER_USER_AGENT.toLowerCase();
    const specific = groups.find((g) => g.agents.some((a) => a !== "*" && ua.includes(a)));
    const wildcard = groups.find((g) => g.agents.includes("*"));
    return new RobotsRules((specific ?? wildcard)?.disallow ?? []);
  }

  isAllowed(pathname: string): boolean {
    return !this.disallow.some((rule) => rule !== "" && pathname.startsWith(rule));
  }
}

async function fetchRobots(origin: string): Promise<RobotsRules> {
  try {
    let url: string | null = `${origin}/robots.txt`;
    const fetcher = __fetcherImpl ?? fetchWithPinnedIp;

    for (let hop = 0; hop <= 5 && url; hop += 1) {
      const resolvedIps = await assertPublicHttpUrl(url);
      const res = await fetcher(url, resolvedIps, {
        headers: { "User-Agent": CRAWLER_USER_AGENT, Accept: "text/plain" },
        signal: AbortSignal.timeout(PER_FETCH_TIMEOUT_MS)
      });

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        url = location ? new URL(location, url).toString() : null;
        continue;
      }

      if (res.status < 200 || res.status >= 300) return RobotsRules.parse("");
      return RobotsRules.parse(await res.text());
    }
    return RobotsRules.parse("");
  } catch {
    return RobotsRules.parse("");
  }
}

type FetchedHtml = { finalUrl: string; html: string } | null;

// Test-only hook: allows unit tests to swap out the low-level pinned-IP fetcher
// without hitting real network. Not part of the public API.
let __fetcherImpl: typeof fetchWithPinnedIp | null = null;

export function __swapFetcherForTesting(fn: typeof fetchWithPinnedIp | null): void {
  __fetcherImpl = fn;
}

/**
 * Fetch an HTML page with SSRF re-validation on every hop, manual redirect
 * following, a body-size cap, and a content-type guard. Returns null for
 * non-HTML or failed fetches (the crawler skips those).
 */
async function fetchHtml(startUrl: string): Promise<FetchedHtml> {
  let url = startUrl;
  const fetcher = __fetcherImpl ?? fetchWithPinnedIp;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    // Resolve + validate IPs, then pin the connection to prevent DNS-rebinding TOCTOU.
    const resolvedIps = await assertPublicHttpUrl(url);

    const res = await fetcher(url, resolvedIps, {
      headers: { "User-Agent": CRAWLER_USER_AGENT, Accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(PER_FETCH_TIMEOUT_MS)
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return null;
      url = new URL(location, url).toString();
      continue;
    }

    if (res.status < 200 || res.status >= 300) return null;

    const contentType = res.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) return null;

    const declaredLength = Number(res.headers.get("content-length") ?? "0");
    if (declaredLength > MAX_BODY_BYTES) return null;

    const body = await res.text();
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) return null;
    return { finalUrl: url, html: body };
  }

  return null; // too many redirects
}

/**
 * Breadth-first crawl from `rootUrl`, staying on the root's origin, honouring
 * robots.txt and the hard caps above. Every fetch is SSRF-guarded. Returns the
 * extracted text per page; the caller handles storage/embedding.
 */
export async function crawlSite(options: {
  rootUrl: string;
  maxDepth: number;
  maxPages: number;
}): Promise<CrawlResult> {
  const maxDepth = Math.max(0, Math.min(options.maxDepth, MAX_CRAWL_DEPTH));
  const maxPages = Math.max(1, Math.min(options.maxPages, MAX_CRAWL_PAGES));

  const rootUrl = normalizeForVisit(options.rootUrl);
  const rootOrigin = new URL(rootUrl).origin;
  const robots = await fetchRobots(rootOrigin);

  const visited = new Set<string>();
  const queued = new Set<string>([rootUrl]);
  let frontier: { url: string; depth: number }[] = [{ url: rootUrl, depth: 0 }];
  const pages: CrawledPage[] = [];
  const startedAt = Date.now();
  let truncated = false;

  while (frontier.length > 0 && pages.length < maxPages) {
    if (Date.now() - startedAt > TOTAL_TIME_BUDGET_MS) {
      truncated = true;
      break;
    }
    const next: { url: string; depth: number }[] = [];

    for (const { url, depth } of frontier) {
      if (pages.length >= maxPages) {
        truncated = true;
        break;
      }
      if (visited.has(url)) continue;
      visited.add(url);

      let pathname: string;
      try {
        pathname = new URL(url).pathname;
      } catch {
        continue;
      }
      if (!robots.isAllowed(pathname)) continue;

      let fetched: FetchedHtml;
      try {
        fetched = await fetchHtml(url);
      } catch (err) {
        logger.warn({ err, url }, "crawler.fetch.failed");
        continue;
      }
      if (!fetched) continue;

      const text = htmlToText(fetched.html);
      if (text.length >= MIN_TEXT_LENGTH) {
        pages.push({
          url: normalizeForVisit(fetched.finalUrl),
          title: extractTitle(fetched.html),
          text,
          contentHash: sha256(text)
        });
      }

      if (depth < maxDepth) {
        for (const link of extractLinks(fetched.html, fetched.finalUrl)) {
          const candidate = normalizeForVisit(link);
          let sameOrigin = false;
          try {
            sameOrigin = new URL(candidate).origin === rootOrigin;
          } catch {
            sameOrigin = false;
          }
          if (sameOrigin && !visited.has(candidate) && !queued.has(candidate)) {
            queued.add(candidate);
            next.push({ url: candidate, depth: depth + 1 });
          }
        }
      }
    }

    frontier = next;
  }

  if (frontier.length > 0) truncated = true;

  return { pages, pagesVisited: visited.size, truncated };
}
