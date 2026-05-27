import type { NextApiRequest, NextApiResponse } from "next";

import { BusinessCategory } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://heita.co.za";

function urlEntry(
  loc: string,
  lastmod?: string,
  changefreq = "weekly",
  priority = "0.7"
) {
  return `  <url>
    <loc>${loc}</loc>
    ${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

const CATEGORIES = Object.values(BusinessCategory);

export default async function handler(
  _req: NextApiRequest,
  res: NextApiResponse
) {
  const businesses = await prisma.business.findMany({
    where: { deletedAt: null, isActive: true },
    select: { slug: true, updatedAt: true },
    orderBy: { createdAt: "desc" },
    take: 50000
  });

  const staticPages = [
    urlEntry(`${BASE_URL}/`, undefined, "daily", "1.0"),
    urlEntry(`${BASE_URL}/discover`, undefined, "daily", "0.9"),
    urlEntry(`${BASE_URL}/pricing`, undefined, "monthly", "0.6"),
    urlEntry(`${BASE_URL}/privacy`, undefined, "monthly", "0.4"),
    urlEntry(`${BASE_URL}/terms`, undefined, "monthly", "0.4")
  ];

  const categoryPages = CATEGORIES.map((cat) =>
    urlEntry(
      `${BASE_URL}/categories/${cat.toLowerCase()}`,
      undefined,
      "daily",
      "0.8"
    )
  );

  const businessPages = businesses.map((b) =>
    urlEntry(
      `${BASE_URL}/b/${b.slug}`,
      b.updatedAt.toISOString().split("T")[0],
      "weekly",
      "0.7"
    )
  );

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${[...staticPages, ...categoryPages, ...businessPages].join("\n")}
</urlset>`;

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600");
  res.status(200).send(xml);
}
