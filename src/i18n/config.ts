export const locales = ["en-ZA", "zu", "xh", "af"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en-ZA";

export const LOCALE_COOKIE = "heita-locale";

export const localeLabels: Record<Locale, string> = {
  "en-ZA": "English (South Africa)",
  zu: "isiZulu",
  xh: "isiXhosa",
  af: "Afrikaans"
};

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}
