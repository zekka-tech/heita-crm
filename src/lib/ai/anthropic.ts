export function getAnthropicClient() {
  return {
    apiKeyConfigured: Boolean(process.env.ANTHROPIC_API_KEY)
  };
}
