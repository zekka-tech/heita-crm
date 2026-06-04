import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { extractLinks, extractTitle, htmlToText } from "@/lib/ai/html-extract";

// SSRF guard is tested separately; here we no-op it so we can exercise crawl
// logic against a mocked fetch without real DNS/network.
vi.mock("@/lib/security", () => ({
  assertPublicHttpUrl: vi.fn().mockResolvedValue(["93.184.216.34"])
}));

import { crawlSite } from "@/lib/ai/web-crawler";

describe("htmlToText", () => {
  it("strips scripts/styles/nav and decodes entities", () => {
    const html = `
      <html><head><title>T</title><style>.x{}</style></head>
      <body>
        <nav>Menu Home About</nav>
        <script>alert('x')</script>
        <h1>Welcome &amp; hello</h1>
        <p>Price is R1&nbsp;234.</p>
        <footer>© 2026</footer>
      </body></html>`;
    const text = htmlToText(html);
    expect(text).toContain("Welcome & hello");
    expect(text).toContain("Price is R1 234.");
    expect(text).not.toContain("alert");
    expect(text).not.toContain("Menu Home About");
    expect(text).not.toContain(".x{}");
  });
});

describe("extractTitle", () => {
  it("returns the decoded title", () => {
    expect(extractTitle("<title>Acme &amp; Co</title>")).toBe("Acme & Co");
    expect(extractTitle("<p>no title</p>")).toBeNull();
  });
});

describe("extractLinks", () => {
  it("resolves relative links, drops non-http, dedupes and strips fragments", () => {
    const html = `
      <a href="/a">A</a>
      <a href="a#frag">A again</a>
      <a href="https://other.com/b">B</a>
      <a href="mailto:x@y.com">mail</a>
      <a href="javascript:void(0)">js</a>`;
    const links = extractLinks(html, "https://site.com/dir/");
    expect(links).toContain("https://site.com/a");
    expect(links).toContain("https://site.com/dir/a");
    expect(links).toContain("https://other.com/b");
    expect(links.some((l) => l.startsWith("mailto"))).toBe(false);
    expect(links.some((l) => l.includes("javascript"))).toBe(false);
  });
});

describe("crawlSite", () => {
  function htmlPage(links: string[], body = "This page has enough readable text to be indexed by the crawler.") {
    return new Response(
      `<html><head><title>Page</title></head><body><p>${body}</p>${links
        .map((href) => `<a href="${href}">link</a>`)
        .join("")}</body></html>`,
      { status: 200, headers: { "content-type": "text/html" } }
    );
  }

  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("crawls same-origin links up to the depth limit and skips off-origin", async () => {
    const pages: Record<string, Response> = {
      "https://site.com/": htmlPage(["/about", "/contact", "https://external.com/x"]),
      "https://site.com/about": htmlPage(["/team"]),
      "https://site.com/contact": htmlPage([]),
      "https://site.com/team": htmlPage([])
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.endsWith("/robots.txt")) return new Response("", { status: 404 });
        const key = url.replace(/\/$/, "") || "https://site.com";
        return pages[url] ?? pages[`${key}/`] ?? pages[key] ?? new Response("", { status: 404 });
      })
    );

    const result = await crawlSite({ rootUrl: "https://site.com/", maxDepth: 1, maxPages: 50 });
    const urls = result.pages.map((p) => p.url).sort();

    // depth 1 → root + its same-origin links, but NOT /team (depth 2) or external.
    expect(urls).toContain("https://site.com/");
    expect(urls).toContain("https://site.com/about");
    expect(urls).toContain("https://site.com/contact");
    expect(urls).not.toContain("https://site.com/team");
    expect(urls.some((u) => u.includes("external.com"))).toBe(false);
  });

  it("honours the maxPages cap", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.endsWith("/robots.txt")) return new Response("", { status: 404 });
        // Every page links to two fresh same-origin pages → unbounded without the cap.
        const n = Math.floor(Math.random() * 1e9);
        return htmlPage([`/p/${n}`, `/p/${n + 1}`]);
      })
    );

    const result = await crawlSite({ rootUrl: "https://site.com/", maxDepth: 3, maxPages: 5 });
    expect(result.pages.length).toBeLessThanOrEqual(5);
    expect(result.truncated).toBe(true);
  });

  it("skips non-html responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.endsWith("/robots.txt")) return new Response("", { status: 404 });
        return new Response("binary", { status: 200, headers: { "content-type": "application/octet-stream" } });
      })
    );
    const result = await crawlSite({ rootUrl: "https://site.com/", maxDepth: 1, maxPages: 10 });
    expect(result.pages.length).toBe(0);
  });
});
