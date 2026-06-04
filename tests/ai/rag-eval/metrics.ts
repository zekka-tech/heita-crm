/**
 * Pure-function RAG retrieval metrics.
 * No dependencies — safe to import in any context.
 */

/**
 * Recall@k: fraction of relevant items found in the top-k retrieved results.
 * Returns 1 when `relevant` is empty (vacuously true — nothing to miss).
 */
export function recallAtK(
  retrieved: string[],
  relevant: Set<string>,
  k: number
): number {
  if (relevant.size === 0) return 1;
  const topK = retrieved.slice(0, k);
  const hits = topK.filter((id) => relevant.has(id)).length;
  return hits / relevant.size;
}

/**
 * Mean Reciprocal Rank: 1 / rank of the first relevant item.
 * Returns 0 when no relevant item appears in `retrieved`.
 */
export function mrr(retrieved: string[], relevant: Set<string>): number {
  for (let i = 0; i < retrieved.length; i++) {
    if (relevant.has(retrieved[i]!)) return 1 / (i + 1);
  }
  return 0;
}

/**
 * Precision@k: fraction of the top-k results that are relevant.
 */
export function precisionAtK(
  retrieved: string[],
  relevant: Set<string>,
  k: number
): number {
  if (k === 0) return 0;
  const topK = retrieved.slice(0, k);
  const hits = topK.filter((id) => relevant.has(id)).length;
  return hits / k;
}

/**
 * Aggregate a list of per-query metric values into mean and min.
 * Useful for reporting across the full golden set.
 */
export function aggregate(scores: number[]): { mean: number; min: number } {
  if (!scores.length) return { mean: 0, min: 0 };
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const min = Math.min(...scores);
  return { mean, min };
}
