import { router, protectedProcedure } from "@/server/trpc";

export const aiRouter = router({
  status: protectedProcedure.query(() => {
    return {
      primary: "ollama",
      fallback: "anthropic",
      embeddings: "1024d"
    };
  })
});

