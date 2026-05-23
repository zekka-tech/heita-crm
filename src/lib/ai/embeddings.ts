export function getEmbeddingRuntime() {
  return {
    ollamaModel: process.env.OLLAMA_EMBED_MODEL ?? "mxbai-embed-large",
    anthropicFallback: "voyage-3",
    dimensions: 1024
  };
}

