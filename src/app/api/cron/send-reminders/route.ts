import { NextResponse } from "next/server";

function isAuthorized(request: Request) {
  return request.headers.get("x-cron-secret") === process.env.CRON_SECRET;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ ok: true, job: "send-reminders" });
}

