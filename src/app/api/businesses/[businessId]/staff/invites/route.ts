import { StaffRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { csrfFailureResponse } from "@/lib/csrf";
import { enforceRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import {
  createStaffInvite,
  listStaffInvites
} from "@/server/services/staff-invite.service";

const InviteSchema = z
  .object({
    role: z.nativeEnum(StaffRole),
    email: z.string().trim().email().optional(),
    phone: z.string().trim().min(8).max(20).optional()
  })
  .refine((value) => Boolean(value.email || value.phone), {
    message: "Provide an email or phone number for the invite."
  });

type RouteContext = {
  params: Promise<{ businessId: string }>;
};

export async function GET(_: Request, { params }: RouteContext) {
  const { businessId } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const invites = await listStaffInvites({
      businessId,
      actorUserId: session.user.id
    });
    return NextResponse.json({ invites });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Forbidden" },
      { status: 403 }
    );
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  const csrfFailure = await csrfFailureResponse(request);
  if (csrfFailure) return csrfFailure;

  const { businessId } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const limit = await enforceRateLimit({
    identifier: `staff-invite:${session.user.id}:${businessId}`,
    windowSeconds: 60,
    max: 5
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Slow down before sending another invite." },
      { status: 429, headers: rateLimitHeaders(limit) }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = InviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid invite." },
      { status: 400 }
    );
  }

  try {
    const { invite, acceptUrl } = await createStaffInvite({
      businessId,
      actorUserId: session.user.id,
      role: parsed.data.role,
      email: parsed.data.email ?? null,
      phone: parsed.data.phone ?? null
    });

    return NextResponse.json({
      ok: true,
      invite: {
        id: invite.id,
        role: invite.role,
        email: invite.email,
        phone: invite.phone,
        status: invite.status,
        expiresAt: invite.expiresAt.toISOString()
      },
      // Dev convenience: expose the acceptUrl when running outside production so
      // operators can copy it without hitting an email inbox.
      acceptUrl: process.env.NODE_ENV !== "production" ? acceptUrl : undefined
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invite failed" },
      { status: 400 }
    );
  }
}
