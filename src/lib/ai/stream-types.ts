/** Token-usage summary resolved after a streaming response is fully consumed. */
export type StreamUsage = {
  inputTokens: number;
  outputTokens: number;
  /** Anthropic only: tokens read from the prompt cache (cheaper than input). */
  cacheReadTokens: number;
  /** Anthropic only: tokens written to the prompt cache (slightly costlier). */
  cacheCreationTokens: number;
};

export type StreamWithUsage = {
  stream: AsyncGenerator<string>;
  /** Resolves with token counts after the stream is consumed or abandoned. */
  usage: Promise<StreamUsage>;
};

export const ZERO_USAGE: StreamUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
};
