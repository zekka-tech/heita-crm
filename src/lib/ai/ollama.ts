export async function checkOllamaHealth() {
  const response = await fetch(`${process.env.OLLAMA_BASE_URL ?? "http://localhost:11434"}/api/tags`, {
    method: "GET"
  });

  return response.ok;
}

