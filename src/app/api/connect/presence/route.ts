import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { csrfFailureResponse } from "@/lib/csrf";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rate-limit";
import {
  clearTyping,
  setPresence,
  setTyping
} from "@/server/services/presence.service";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<Response> {
  const csrfFailure = await csrfFailureResponse(request);
  if (csrfFailure) return csrfFailure;

  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit: max 20 presence events per second per user (audit finding 5).
  const rl = await enforceRateLimit({
    identifier: `presence:${userId}`,
    windowSeconds: 1,
    max: 20
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many presence updates. Slow down." },
      { status: 429, headers: { "Retry-After": "1" } }
    );
  }

  let body: {
    action?: "heartbeat" | "typing_start" | "typing_stop";
    conversationId?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    switch (body.action) {
      case "heartbeat":
        await setPresence(userId);
        break;
      case "typing_start":
        if (!body.conversationId) {
          return NextResponse.json(
            { error: "conversationId required for typing actions." },
            { status: 400 }
          );
        }
        await setTyping(body.conversationId, userId);
        break;
      case "typing_stop":
        if (!body.conversationId) {
          return NextResponse.json(
            { error: "conversationId required for typing actions." },
            { status: 400 }
          );
        }
        await clearTyping(body.conversationId, userId);
        break;
      default:
        return NextResponse.json(
          { error: "Invalid action. Use heartbeat, typing_start, or typing_stop." },
          { status: 400 }
        );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "connect.presence.error");
    return NextResponse.json({ error: "Failed to update presence." }, { status: 500 });
  }
}
