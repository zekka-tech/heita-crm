import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { csrfFailureResponse } from "@/lib/csrf";
import { revokeStaffInvite } from "@/server/services/staff-invite.service";

type RouteContext = {
  params: Promise<{ businessId: string; inviteId: string }>;
};

export async function DELETE(request: Request, { params }: RouteContext) {
  const csrfFailure = await csrfFailureResponse(request);
  if (csrfFailure) return csrfFailure;

  const { inviteId } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const invite = await revokeStaffInvite({
      inviteId,
      actorUserId: session.user.id
    });
    return NextResponse.json({
      ok: true,
      invite: {
        id: invite.id,
        status: invite.status
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Forbidden" },
      { status: 403 }
    );
  }
}
