import { cookies, headers } from "next/headers";

import { defaultLocale, isLocale, LOCALE_COOKIE, type Locale } from "@/i18n/config";

/**
 * Resolve the user's locale from cookie first, then Accept-Language header,
 * falling back to defaultLocale. Returns one of the configured locales only.
 */
export async function resolveLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(LOCALE_COOKIE)?.value;
  if (cookieValue && isLocale(cookieValue)) {
    return cookieValue;
  }

  const headerStore = await headers();
  const acceptLanguage = headerStore.get("accept-language") ?? "";

  for (const segment of acceptLanguage.split(",")) {
    const tag = segment.split(";")[0]?.trim().toLowerCase();
    if (!tag) continue;
    if (tag === "en-za" || tag.startsWith("en")) return "en-ZA";
    if (tag.startsWith("zu")) return "zu";
    if (tag.startsWith("xh")) return "xh";
    if (tag.startsWith("af")) return "af";
  }

  return defaultLocale;
}
