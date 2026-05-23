export async function POST() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const chunks = [
        "event: status\ndata: primary=ollama fallback=anthropic\n\n",
        "data: This is a placeholder AI response stream for the Heita workspace.\n\n",
        "event: done\ndata: complete\n\n"
      ];

      chunks.forEach((chunk, index) => {
        setTimeout(() => {
          controller.enqueue(encoder.encode(chunk));

          if (index === chunks.length - 1) {
            controller.close();
          }
        }, index * 120);
      });
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}

