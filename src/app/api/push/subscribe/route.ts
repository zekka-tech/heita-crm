import { NextResponse } from "next/server";
import { z } from "zod";

import { getBuildPhaseRouteResponse } from "@/lib/build-phase";
import { csrfFailureResponse } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";
import { authenticateRequestUser } from "@/lib/request-auth";

const PushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1)
  })
});

export async function POST(request: Request) {
  const buildResponse = getBuildPhaseRouteResponse();
  if (buildResponse) return buildResponse;

  const csrfFailure = await csrfFailureResponse(request);
  if (csrfFailure) return csrfFailure;

  const session = await authenticateRequestUser(request.headers);
  if (!session?.userId) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = PushSubscriptionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid push subscription." }, { status: 400 });
  }

  await prisma.pushSubscription.upsert({
    where: {
      endpoint: parsed.data.endpoint
    },
    update: {
      userId: session.userId,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth
    },
    create: {
      userId: session.userId,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth
    }
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const buildResponse = getBuildPhaseRouteResponse();
  if (buildResponse) return buildResponse;

  const csrfFailure = await csrfFailureResponse(request);
  if (csrfFailure) return csrfFailure;

  const session = await authenticateRequestUser(request.headers);
  if (!session?.userId) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = z.object({ endpoint: z.string().url() }).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid push subscription." }, { status: 400 });
  }

  await prisma.pushSubscription.deleteMany({
    where: {
      endpoint: parsed.data.endpoint,
      userId: session.userId
    }
  });

  return NextResponse.json({ ok: true });
}
