import { createHash } from "node:crypto";

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
    const robotsUrl = `${origin}/robots.txt`;
    await assertPublicHttpUrl(robotsUrl);
    const res = await fetch(robotsUrl, {
      headers: { "User-Agent": CRAWLER_USER_AGENT, Accept: "text/plain" },
      redirect: "follow",
      signal: AbortSignal.timeout(PER_FETCH_TIMEOUT_MS)
    });
    if (!res.ok) return RobotsRules.parse("");
    return RobotsRules.parse(await res.text());
  } catch {
    // No robots.txt / unreachable → allow everything (standard behaviour).
    return RobotsRules.parse("");
  }
}

type FetchedHtml = { finalUrl: string; html: string } | null;

/**
 * Fetch an HTML page with SSRF re-validation on every hop, manual redirect
 * following, a body-size cap, and a content-type guard. Returns null for
 * non-HTML or failed fetches (the crawler skips those).
 */
async function fetchHtml(startUrl: string): Promise<FetchedHtml> {
  let url = startUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    await assertPublicHttpUrl(url); // re-checked each hop — defends redirect SSRF

    const res = await fetch(url, {
      headers: { "User-Agent": CRAWLER_USER_AGENT, Accept: "text/html,application/xhtml+xml" },
      redirect: "manual",
      signal: AbortSignal.timeout(PER_FETCH_TIMEOUT_MS)
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return null;
      url = new URL(location, url).toString();
      continue;
    }

    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) return null;

    const declaredLength = Number(res.headers.get("content-length") ?? "0");
    if (declaredLength > MAX_BODY_BYTES) return null;

    const buffer = await readCapped(res, MAX_BODY_BYTES);
    if (buffer === null) return null;
    return { finalUrl: url, html: buffer };
  }

  return null; // too many redirects
}

async function readCapped(res: Response, maxBytes: number): Promise<string | null> {
  if (!res.body) {
    const text = await res.text();
    return Buffer.byteLength(text) > maxBytes ? null : text;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");
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
