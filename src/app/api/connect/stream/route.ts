import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { subscribeToChannel } from "@/lib/redis-pubsub";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function sseFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(request: NextRequest): Promise<Response> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const signal = request.signal;
  const encoder = new TextEncoder();
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      const channel = `user:${userId}:events`;

      const unsubscribe = await subscribeToChannel(channel, (msg) => {
        try {
          const frame = sseFrame("message", msg);
          controller.enqueue(encoder.encode(frame));
        } catch {
          // Stream may already be closed; ignore write errors.
        }
      });

      if (signal.aborted) {
        unsubscribe();
        controller.close();
        return;
      }

      const onAbort = () => {
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        heartbeatInterval = null;
        unsubscribe();
        try { controller.close(); } catch { /* already closed */ }
      };

      signal.addEventListener("abort", onAbort, { once: true });

      controller.enqueue(encoder.encode(sseFrame("connected", { userId })));

      heartbeatInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(sseFrame("heartbeat", { ts: Date.now() })));
        } catch {
          onAbort();
        }
      }, 30_000);
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    }
  });
}
