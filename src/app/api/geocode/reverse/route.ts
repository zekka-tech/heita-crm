import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { enforceRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/security";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://heita.co.za";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const ip = getClientIp(request.headers);

  // Rate-limit: 1 req/sec per IP (Nominatim's published policy)
  const rl = await enforceRateLimit({
    identifier: `geocode:reverse:${ip}`,
    windowSeconds: 1,
    max: 1
  });

  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many location requests. Please wait a moment." },
      { status: 429 }
    );
  }

  const { searchParams } = request.nextUrl;
  const lat = searchParams.get("lat");
  const lon = searchParams.get("lon");

  if (!lat || !lon) {
    return NextResponse.json({ error: "lat and lon are required." }, { status: 400 });
  }

  const latNum = parseFloat(lat);
  const lonNum = parseFloat(lon);
  if (isNaN(latNum) || isNaN(lonNum) || latNum < -90 || latNum > 90 || lonNum < -180 || lonNum > 180) {
    return NextResponse.json({ error: "Invalid coordinates." }, { status: 400 });
  }

  const nominatimUrl = new URL(NOMINATIM_URL);
  nominatimUrl.searchParams.set("lat", latNum.toFixed(6));
  nominatimUrl.searchParams.set("lon", lonNum.toFixed(6));
  nominatimUrl.searchParams.set("format", "json");
  nominatimUrl.searchParams.set("accept-language", "en");

  const response = await fetch(nominatimUrl.toString(), {
    headers: {
      "User-Agent": `HeitaCRM/1.0 (${APP_URL})`,
      "Referer": APP_URL,
      // Don't forward session cookies to third parties
      "Cookie": ""
    },
    // Server-side: no CORS restriction
    signal: AbortSignal.timeout(8_000)
  });

  if (!response.ok) {
    return NextResponse.json({ error: "Reverse geocoding failed." }, { status: 502 });
  }

  const data = (await response.json()) as {
    address?: {
      suburb?: string;
      city?: string;
      town?: string;
      village?: string;
      municipality?: string;
    };
  };

  // Return only the locality fields — no raw Nominatim payload exposed
  const addr = data.address ?? {};
  const locality =
    addr.suburb ??
    addr.city ??
    addr.town ??
    addr.village ??
    addr.municipality ??
    null;

  return NextResponse.json({ locality }, { status: 200 });
}
