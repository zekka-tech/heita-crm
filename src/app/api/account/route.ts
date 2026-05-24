import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { csrfFailureResponse } from "@/lib/csrf";
import { updateAccountProfile, softDeleteAccount } from "@/server/services/account.service";

const UpdateAccountSchema = z.object({
  name: z.string().trim().min(1).max(100).nullable().optional(),
  email: z.string().trim().email().nullable().optional(),
  preferredAiMode: z.string().trim().min(1).max(50).nullable().optional()
});

export async function PATCH(request: Request) {
  const csrfFailure = await csrfFailureResponse(request);
  if (csrfFailure) return csrfFailure;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = UpdateAccountSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid account update." }, { status: 400 });
  }

  const user = await updateAccountProfile({
    userId: session.user.id,
    name: parsed.data.name ?? undefined,
    email: parsed.data.email ?? undefined,
    preferredAiMode: parsed.data.preferredAiMode ?? undefined
  });

  return NextResponse.json({
    ok: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      preferredAiMode: user.preferredAiMode
    }
  });
}

export async function DELETE(request: Request) {
  const csrfFailure = await csrfFailureResponse(request);
  if (csrfFailure) return csrfFailure;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  await softDeleteAccount(session.user.id);
  return NextResponse.json({ ok: true });
}
