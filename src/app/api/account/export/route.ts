import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { csrfFailureResponse } from "@/lib/csrf";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rate-limit";
import { exportAccountData } from "@/server/services/account.service";

export const dynamic = "force-dynamic";

// 1 export per 30 days per user (2592000 seconds)
const EXPORT_WINDOW_SECONDS = 30 * 24 * 60 * 60;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const csrfFailure = await csrfFailureResponse(request);
  if (csrfFailure) {
    return csrfFailure as NextResponse;
  }

  // Rate limit: 1 export per 30 days per user
  const rl = await enforceRateLimit({
    identifier: `export:${userId}`,
    windowSeconds: EXPORT_WINDOW_SECONDS,
    max: 1
  });

  if (!rl.allowed) {
    return NextResponse.json(
      {
        error: "You can only export your data once every 30 days.",
        resetInSeconds: rl.resetInSeconds
      },
      { status: 429 }
    );
  }

  try {
    const data = await exportAccountData(userId);

    return new NextResponse(JSON.stringify(data, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": 'attachment; filename="heita-data-export.json"'
      }
    }) as NextResponse;
  } catch (err) {
    logger.error({ err }, "account.export.error");
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
