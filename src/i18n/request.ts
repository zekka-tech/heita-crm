import { getRequestConfig } from "next-intl/server";

import { defaultLocale } from "@/i18n/config";
import { resolveLocale } from "@/i18n/locale";

export default getRequestConfig(async () => {
  const locale = await resolveLocale().catch(() => defaultLocale);

  const messages = (
    await import(`../../messages/${locale}.json`).catch(() => import("../../messages/en-ZA.json"))
  ).default;

  return {
    locale,
    messages,
    now: new Date(),
    timeZone: "Africa/Johannesburg"
  };
});
