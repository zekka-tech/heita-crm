import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error: "Presigned upload URLs are not implemented yet"
    },
    {
      status: 501
    }
  );
}

