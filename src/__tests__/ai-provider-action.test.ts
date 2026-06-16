import { beforeEach, describe, expect, it, vi } from "vitest";

import { TELEMETRY_EVENTS } from "@/lib/telemetry-events";

vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => ({ user: { id: "owner-1" } })) }));
vi.mock("@/lib/csrf", () => ({ requireCsrfFormData: vi.fn(async () => undefined) }));
vi.mock("@/server/services/ai-provider.service", () => ({
  createProviderConnection: vi.fn(async () => ({ id: "conn-1" })),
  validateProviderConnection: vi.fn(async () => ({ status: "ACTIVE" })),
  setActiveProviderConnection: vi.fn(async () => undefined),
  deleteProviderConnection: vi.fn(async () => undefined)
}));
vi.mock("@/lib/telemetry", () => ({ captureEvent: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${url};307;` });
  })
}));

const { captureEvent } = await import("@/lib/telemetry");
const { createProviderConnection } = await import("@/server/services/ai-provider.service");
const { addProviderConnectionAction } = await import(
  "@/app/dashboard/[businessId]/settings/ai-models/actions"
);

function makeForm(fields: Record<string, string>): FormData {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return form;
}

// addProviderConnectionAction always ends in a redirect() (which we mock to
// throw NEXT_REDIRECT). Run it and swallow that control-flow throw.
async function runAction(form: FormData): Promise<void> {
  try {
    await addProviderConnectionAction(form);
  } catch (err) {
    if (!(err instanceof Error) || !err.message.startsWith("NEXT_REDIRECT")) throw err;
  }
}

describe("addProviderConnectionAction — provider_selected telemetry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("emits provider_selected once the connection is saved", async () => {
    await runAction(
      makeForm({
        businessId: "biz-1",
        provider: "ANTHROPIC",
        chatModel: "claude-opus-4-8",
        apiKey: "sk-test",
        label: "Primary"
      })
    );

    expect(captureEvent).toHaveBeenCalledTimes(1);
    expect(captureEvent).toHaveBeenCalledWith({
      userId: "owner-1",
      event: TELEMETRY_EVENTS.providerSelected,
      properties: { businessId: "biz-1", provider: "ANTHROPIC", model: "claude-opus-4-8" }
    });
  });

  it("does not emit provider_selected when the connection cannot be created", async () => {
    vi.mocked(createProviderConnection).mockRejectedValueOnce(new Error("invalid key"));

    await runAction(makeForm({ businessId: "biz-1", provider: "ANTHROPIC", apiKey: "sk-bad" }));

    expect(captureEvent).not.toHaveBeenCalled();
  });
});
