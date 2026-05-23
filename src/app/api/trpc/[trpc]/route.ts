import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ trpc: "stubbed" }, { status: 501 });
}

export async function POST() {
  return NextResponse.json({ trpc: "stubbed" }, { status: 501 });
}
