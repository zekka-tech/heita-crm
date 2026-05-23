import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = await request.text();

  console.log("Africa's Talking webhook received", body);

  return NextResponse.json({ received: true });
}

