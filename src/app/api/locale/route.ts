import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { csrfFailureResponse } from "@/lib/csrf";
import { LOCALE_COOKIE, isLocale } from "@/i18n/config";

const LOCALE_TTL_DAYS = 365;

const PayloadSchema = z.object({
  locale: z.string().min(2).max(10)
});

export async function POST(request: Request) {
  const csrfFailure = await csrfFailureResponse(request);
  if (csrfFailure) return csrfFailure;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = PayloadSchema.safeParse(body);
  if (!parsed.success || !isLocale(parsed.data.locale)) {
    return NextResponse.json({ error: "Unsupported locale." }, { status: 400 });
  }

  const store = await cookies();
  store.set(LOCALE_COOKIE, parsed.data.locale, {
    maxAge: LOCALE_TTL_DAYS * 24 * 60 * 60,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    httpOnly: false
  });

  return NextResponse.json({ ok: true, locale: parsed.data.locale });
}
