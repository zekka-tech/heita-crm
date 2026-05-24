import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/discover", "/b/", "/categories/"],
      disallow: ["/dashboard/", "/api/", "/home", "/wallet", "/notifications", "/profile"]
    }
  };
}
