/**
 * Safe JSON-LD serializer for use in dangerouslySetInnerHTML.
 *
 * JSON.stringify alone does NOT escape `</script>` inside string values,
 * which allows stored XSS via business-controlled fields (name, description,
 * address) in structured-data script tags (audit finding 18).
 *
 * This helper escapes `<`, `>`, and `&` inside the JSON output so that the
 * serialized value is safe to inject into an HTML `<script>` tag without
 * breaking out of it. This is the same technique used by Django, Rails, and
 * Next.js itself for inline JSON injection.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}
