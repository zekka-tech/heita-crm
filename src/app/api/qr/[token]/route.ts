import { NextResponse } from "next/server";

import { generateQrSvg } from "@/lib/qr";

type QrRouteProps = {
  params: Promise<{ token: string }>;
};

export async function GET(_: Request, { params }: QrRouteProps) {
  const { token } = await params;
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const svg = await generateQrSvg(`${origin}/join/${token}`);

  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=300"
    }
  });
}
