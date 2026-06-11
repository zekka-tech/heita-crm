import { afterEach, describe, expect, it, vi } from "vitest";

import {
  probeOpenAiCompatibleChat,
  streamOpenAiCompatibleChat
} from "@/lib/ai/providers/openai-compatible";

function sseResponse(lines: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(`${line}\n`));
      }
      controller.close();
    }
  });
  return new Response(stream, { status: 200 });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("streamOpenAiCompatibleChat", () => {
  it("streams deltas and resolves usage from the final frame", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      sseResponse([
        'data: {"choices":[{"delta":{"content":"Hel"}}]}',
        'data: {"choices":[{"delta":{"content":"lo"}}]}',
        'data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":2,"prompt_tokens_details":{"cached_tokens":3}}}',
        "data: [DONE]"
      ])
    );

    const { stream, usage } = await streamOpenAiCompatibleChat({
      baseUrl: "https://api.example.com/v1/",
      apiKey: "sk-test",
      model: "test-model",
      system: "You are helpful.",
      messages: [{ role: "user", content: "Hi" }]
    });

    let text = "";
    for await (const chunk of stream) text += chunk;

    expect(text).toBe("Hello");
    await expect(usage).resolves.toEqual({
      inputTokens: 10,
      outputTokens: 2,
      cacheReadTokens: 3,
      cacheCreationTokens: 0
    });

    // Trailing slash collapsed; system message prepended; auth header set.
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.example.com/v1/chat/completions");
    const body = JSON.parse(String(init!.body));
    expect(body.messages[0]).toEqual({ role: "system", content: "You are helpful." });
    expect(body.stream).toBe(true);
    expect(new Headers(init!.headers as HeadersInit).get("authorization")).toBe(
      "Bearer sk-test"
    );
  });

  it("throws with status and body excerpt on a non-OK response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response('{"error":{"message":"invalid api key"}}', { status: 401 })
    );

    await expect(
      streamOpenAiCompatibleChat({
        baseUrl: "https://api.example.com/v1",
        apiKey: "sk-bad",
        model: "test-model",
        messages: [{ role: "user", content: "Hi" }]
      })
    ).rejects.toThrow(/401/);
  });

  it("ignores malformed frames instead of crashing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      sseResponse([
        "data: {not json",
        'data: {"choices":[{"delta":{"content":"ok"}}]}',
        "data: [DONE]"
      ])
    );

    const { stream } = await streamOpenAiCompatibleChat({
      baseUrl: "https://api.example.com/v1",
      apiKey: "sk-test",
      model: "test-model",
      messages: [{ role: "user", content: "Hi" }]
    });

    let text = "";
    for await (const chunk of stream) text += chunk;
    expect(text).toBe("ok");
  });
});

describe("probeOpenAiCompatibleChat", () => {
  it("returns null on success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    await expect(
      probeOpenAiCompatibleChat({
        baseUrl: "https://api.example.com/v1",
        apiKey: "sk-test",
        model: "test-model"
      })
    ).resolves.toBeNull();
  });

  it("returns a readable error on failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("model not found", { status: 404 })
    );
    const error = await probeOpenAiCompatibleChat({
      baseUrl: "https://api.example.com/v1",
      apiKey: "sk-test",
      model: "missing"
    });
    expect(error).toMatch(/404/);
  });
});
