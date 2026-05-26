import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const WIDTH = 1200;
const HEIGHT = 630;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const business = await prisma.business.findFirst({
    where: { slug, deletedAt: null },
    select: { name: true, description: true, category: true }
  });

  const name = business?.name ?? "Heita";
  const description =
    business?.description ??
    "Loyalty, messaging, and AI workspaces for South African retail.";
  const category = business?.category
    ? business.category
        .toLowerCase()
        .split("_")
        .map((p: string) => p[0]?.toUpperCase() + p.slice(1))
        .join(" ")
    : null;

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
            "linear-gradient(135deg, #0F1F3D 0%, #0B63C5 60%, #2ECC71 100%)",
          color: "white"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div
            style={{
              width: "60px",
              height: "60px",
              borderRadius: "18px",
              background: "rgba(255,255,255,0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 28,
              fontWeight: 800
            }}
          >
            H
          </div>
          <div
            style={{
              fontSize: 22,
              letterSpacing: 3,
              textTransform: "uppercase",
              opacity: 0.85
            }}
          >
            Heita CRM
          </div>
          {category ? (
            <div
              style={{
                marginLeft: "auto",
                padding: "6px 18px",
                borderRadius: "100px",
                background: "rgba(255,255,255,0.15)",
                fontSize: 18
              }}
            >
              {category}
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div
            style={{
              fontSize: name.length > 30 ? 52 : 68,
              fontWeight: 800,
              lineHeight: 1.05,
              maxWidth: "960px"
            }}
          >
            {name}
          </div>
          <div
            style={{
              fontSize: 26,
              opacity: 0.85,
              maxWidth: "860px",
              lineHeight: 1.4
            }}
          >
            {description.length > 120
              ? description.slice(0, 117) + "…"
              : description}
          </div>
        </div>
      </div>
    ),
    { width: WIDTH, height: HEIGHT }
  );
}
