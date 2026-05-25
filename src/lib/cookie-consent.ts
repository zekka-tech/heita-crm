export const COOKIE_CONSENT_STORAGE_KEY = "heita-cookie-consent";

export type CookieConsentChoice = "accepted" | "rejected";

function isCookieConsentChoice(value: unknown): value is CookieConsentChoice {
  return value === "accepted" || value === "rejected";
}

export function normalizeCookieConsent(
  value: unknown
): CookieConsentChoice | null {
  return isCookieConsentChoice(value) ? value : null;
}

export function readCookieConsent(): CookieConsentChoice | null {
  if (typeof window === "undefined") {
    return null;
  }

  const choice = normalizeCookieConsent(
    window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY)
  );
  if (choice) {
    window.document.documentElement.dataset.cookieConsent = choice;
  }
  return choice;
}

export function writeCookieConsent(choice: CookieConsentChoice) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, choice);
  window.document.documentElement.dataset.cookieConsent = choice;
}

export function canUseNonEssentialCookies(
  consent: CookieConsentChoice | null
) {
  return consent === "accepted";
}
