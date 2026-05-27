import type { MetadataRoute } from "next";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://heita.co.za";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/discover", "/b/", "/categories/"],
      disallow: ["/dashboard/", "/api/", "/home", "/wallet", "/notifications", "/profile"]
    },
    sitemap: `${APP_URL}/sitemap.xml`
  };
}
