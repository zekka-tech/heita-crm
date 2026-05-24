import { NextResponse } from "next/server";

import { getBuildPhaseRouteResponse } from "@/lib/build-phase";
import { csrfFailureResponse } from "@/lib/csrf";
import { authenticateRequestUser } from "@/lib/request-auth";
import { revokeStaffInvite } from "@/server/services/staff-invite.service";

type RouteContext = {
  params: Promise<{ businessId: string; inviteId: string }>;
};

export async function DELETE(request: Request, { params }: RouteContext) {
  const buildResponse = getBuildPhaseRouteResponse();
  if (buildResponse) return buildResponse;

  const csrfFailure = await csrfFailureResponse(request);
  if (csrfFailure) return csrfFailure;

  const { inviteId } = await params;
  const session = await authenticateRequestUser(request.headers);
  if (!session?.userId) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const invite = await revokeStaffInvite({
      inviteId,
      actorUserId: session.userId
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
