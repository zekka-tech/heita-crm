import { ImageResponse } from "next/og";

import { prisma } from "@/lib/prisma";
import { formatEnumLabel } from "@/lib/business";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const size = {
  width: 1200,
  height: 630
};

type BusinessOgProps = {
  params: Promise<{ slug: string }>;
};

export default async function BusinessOpenGraphImage({ params }: BusinessOgProps) {
  const { slug } = await params;
  const business = await prisma.business.findFirst({
    where: {
      slug,
      deletedAt: null
    },
    select: {
      name: true,
      description: true,
      category: true,
      province: true
    }
  });

  const title = business?.name ?? "Heita Business";
  const subtitle = business
    ? `${formatEnumLabel(business.category)} · ${formatEnumLabel(business.province)}`
    : "Join on Heita";
  const description =
    business?.description ??
    "Join this business on Heita to earn points, unlock rewards, and chat with the team.";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "56px",
          background:
            "linear-gradient(145deg, #0F1F3D 0%, #12386E 58%, #2ECC71 100%)",
          color: "white"
        }}
      >
        <div style={{ fontSize: 24, letterSpacing: 3, textTransform: "uppercase", opacity: 0.88 }}>
          {subtitle}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          <div style={{ fontSize: 72, fontWeight: 800, lineHeight: 1.05, maxWidth: "960px" }}>
            {title}
          </div>
          <div style={{ fontSize: 28, opacity: 0.92, maxWidth: "860px" }}>{description}</div>
        </div>
        <div style={{ fontSize: 24, opacity: 0.8 }}>
          Heita CRM · Loyalty, messaging, and AI for South African businesses
        </div>
      </div>
    ),
    size
  );
}
