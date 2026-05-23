import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { generateQrSvg } from "@/lib/qr";

type QrRouteProps = {
  params: Promise<{ token: string }>;
};

export async function GET(_: Request, { params }: QrRouteProps) {
  const { token } = await params;
  const origin =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

  const exists =
    (await prisma.qrCode.findUnique({ where: { token } })) ??
    (await prisma.joinLink.findUnique({ where: { token } }));

  if (!exists) {
    return NextResponse.json({ error: "Unknown token" }, { status: 404 });
  }

  const svg = await generateQrSvg(`${origin}/join/${token}`);

  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
