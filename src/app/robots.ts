import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/discover", "/b/", "/categories/"],
      disallow: ["/dashboard/", "/api/", "/home", "/wallet", "/notifications", "/profile"]
    },
    sitemap: `${baseUrl}/sitemap.xml`
  };
}
