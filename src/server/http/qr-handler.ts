import { NextResponse } from "next/server";

import { withSystemScope } from "@/lib/prisma";
import { generateQrSvg } from "@/lib/qr";

export async function handleQrRequest(token: string) {
  const origin =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

  // QrCode/JoinLink are tenant-scoped (FORCE RLS) with no public-read policy, so
  // this pre-scope token resolver must run under the explicit system scope or it
  // would silently return 0 rows under the non-BYPASSRLS app role.
  const exists = await withSystemScope(
    async (tx) =>
      (await tx.qrCode.findUnique({ where: { token } })) ??
      (await tx.joinLink.findUnique({ where: { token } }))
  );

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
