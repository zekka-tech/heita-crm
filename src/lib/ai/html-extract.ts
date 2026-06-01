// Dependency-light HTML → text + link extraction for the web crawler.
// We avoid a full DOM parser to keep the server bundle small and the attack
// surface minimal; receipts/AI ingestion only need readable text + same-doc
// links, not a faithful DOM.

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  copy: "©",
  reg: "®",
  trade: "™",
  deg: "°"
};

function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isFinite(code) ? safeFromCodePoint(code) : match;
    }
    if (body.startsWith("#")) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? safeFromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

function safeFromCodePoint(code: number): string {
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}

/** Extract the document <title>, decoded and trimmed. */
export function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return null;
  const title = decodeEntities(match[1]!).replace(/\s+/g, " ").trim();
  return title || null;
}

/**
 * Convert an HTML document to readable plain text: drop non-content elements
 * (script/style/head/nav/footer/etc.), turn block boundaries into newlines,
 * strip remaining tags, decode entities, and collapse whitespace.
 */
export function htmlToText(html: string): string {
  let text = html;

  // Remove comments and whole non-content elements (including their content).
  text = text.replace(/<!--[\s\S]*?-->/g, " ");
  text = text.replace(
    /<(script|style|noscript|template|svg|head|nav|footer|header|aside|form|iframe)\b[^>]*>[\s\S]*?<\/\1>/gi,
    " "
  );

  // Block-level tags → newlines so paragraphs/list items don't run together.
  text = text.replace(
    /<\/?(p|div|section|article|br|li|ul|ol|tr|table|h[1-6]|blockquote|pre|hr)\b[^>]*>/gi,
    "\n"
  );

  // Strip every remaining tag.
  text = text.replace(/<[^>]+>/g, " ");

  text = decodeEntities(text);

  // Normalise whitespace: collapse spaces, trim each line, cap blank runs.
  text = text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return text;
}

/**
 * Extract absolute, http(s) links from anchor tags, resolved against `baseUrl`.
 * Fragment-only and non-http links are dropped; results are de-duplicated and
 * stripped of their hash fragment so the crawler treats `/x` and `/x#a` as one.
 */
export function extractLinks(html: string, baseUrl: string): string[] {
  const links = new Set<string>();
  const anchorRe = /<a\b[^>]*\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s">]+))[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = anchorRe.exec(html)) !== null) {
    const raw = (match[2] ?? match[3] ?? match[4] ?? "").trim();
    if (!raw || raw.startsWith("#") || /^(mailto|tel|javascript|data):/i.test(raw)) {
      continue;
    }
    try {
      const resolved = new URL(decodeEntities(raw), baseUrl);
      if (resolved.protocol !== "http:" && resolved.protocol !== "https:") continue;
      resolved.hash = "";
      links.add(resolved.toString());
    } catch {
      // Ignore unparseable hrefs.
    }
  }
  return [...links];
}
