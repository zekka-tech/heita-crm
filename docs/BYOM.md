# Bring Your Own Model (BYOM)

Businesses can power their AI co-worker with their own LLM provider account
instead of the platform defaults. Owners/Managers connect a provider API key
under **Settings → AI model**, pick a model, and activate it; the RAG chat
pipeline then uses that connection as the brain for the AI workspace and
WhatsApp auto-replies.

## Supported providers

| Provider | Protocol | Endpoint |
|---|---|---|
| Anthropic Claude | Anthropic Messages API | `api.anthropic.com` |
| OpenAI (ChatGPT) | OpenAI chat completions | `api.openai.com/v1` |
| Google Gemini | OpenAI-compatible | `generativelanguage.googleapis.com/v1beta/openai` |
| DeepSeek | OpenAI-compatible | `api.deepseek.com/v1` |
| MiniMax | OpenAI-compatible | `api.minimax.io/v1` |
| Kimi (Moonshot AI) | OpenAI-compatible | `api.moonshot.ai/v1` |
| Qwen (DashScope) | OpenAI-compatible | `dashscope-intl.aliyuncs.com/compatible-mode/v1` |
| Custom | OpenAI-compatible | business-supplied base URL |

The **Custom** entry covers any other OpenAI-compatible endpoint — Mino,
Opencode, Hermes Agent (Nous Research), OpenRouter, self-hosted gateways —
by supplying its base URL. Model identifiers are free-text with suggestions,
so new model releases never require a code change.

> Note: provider *subscription* sign-in (e.g. using a ChatGPT Plus login via
> OAuth) is not offered by any of these vendors for third-party server-side
> use; API keys are the supported bring-your-own mechanism. If a provider
> ships a delegated-auth API later, it slots in as a new credential type on
> `AiProviderConnection` without touching the streaming layer.

## Architecture

```
Settings UI (settings/ai-models)            chat route /api/ai/chat
        │ server actions                              │
        ▼                                             ▼
ai-provider.service ────────────────────────► rag.streamRagAnswer
  · CRUD + role checks (OWNER/MANAGER)          │ resolveActiveByokRuntime(businessId)
  · AES-256-GCM encrypt/decrypt                 ▼
  · probe/validate keys                  lib/ai/providers
  · activate per workspace                 · registry.ts   (provider catalog)
  · resolveActiveByokRuntime               · index.ts      (dispatch + SSRF guard)
                                           · openai-compatible.ts (SSE adapter)
                                           · ../anthropic.ts     (Messages API adapter)
```

- **Runtime chain**: active BYOK connection → Ollama (local) → platform
  Anthropic → static fallback message. BYOK failures are logged, recorded on
  the connection (`lastError`), and degrade silently to the next runtime.
- **Usage accounting**: both adapters resolve real token counts after the
  stream is consumed; `AiTokenUsage.runtime` records `byok:<provider>`.
- **Internal AI tasks** (query rewriting, summaries, follow-up drafts via
  `generateText`) intentionally stay on platform runtimes so customer keys
  are only spent on customer-facing answers.

## Data model

`AiProviderConnection` (tenant-scoped by `businessId`): provider enum, optional
label/baseUrl, `encryptedApiKey`, `keyLast4`, `chatModel`, status
(`UNVERIFIED → ACTIVE | INVALID | DISABLED`), `lastValidatedAt`, `lastError`.
`AiWorkspace.activeConnectionId` points at the connection that powers the
workspace (FK `SetNull` on delete).

## Security

- Keys are encrypted at rest with AES-256-GCM (`src/lib/secret-crypto.ts`);
  the key derives from `AI_CREDENTIALS_SECRET` (falls back to `AUTH_SECRET`).
  Ciphertexts are versioned (`v1.`) for future rotation.
- Plaintext keys never leave the service layer: views expose `keyLast4` only,
  and pino redacts `*.apiKey` / `*.encryptedApiKey`.
- Custom base URLs pass the SSRF guard (`assertPublicHttpUrl`) at save time
  **and** before every request (DNS can change between the two).
- All mutations require OWNER/MANAGER staff role, are CSRF-protected server
  actions, and write `StaffAuditLog` entries.
- Saved keys are verified with a one-token probe request before first use.

## Adding a provider

1. Add the enum value in `prisma/schema.prisma` (+ migration).
2. Add a `ProviderDefinition` in `src/lib/ai/providers/registry.ts`.
3. If the provider speaks the OpenAI or Anthropic wire shape, that's it.
   Otherwise add an adapter in `src/lib/ai/providers/` and a branch in
   `streamByokChat` / `probeByokConnection`.
