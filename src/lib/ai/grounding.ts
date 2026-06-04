/**
 * Answer grounding: detect whether a generated answer is supported by the
 * retrieved context chunks.
 *
 * Used both as a production observability guard (log ungrounded answers as a
 * metric) and as a scored dimension in the RAG eval harness.
 *
 * Heuristic: the answer is considered grounded when it contains at least one
 * trigram (3-word sequence of content words) from any retrieved chunk.
 * Trigrams avoid false positives from common stop-word bigrams ("we are",
 * "it is") while keeping the check cheap — no LLM call required.
 *
 * Limitations: paraphrase is not detected; the check is word-order sensitive.
 * For a stricter semantic check, use an NLI model — the heuristic is a
 * reasonable fast baseline for observability.
 */

const MIN_WORD_LEN = 4; // filter out stop-words shorter than this
const TRIGRAM_SEPARATOR = "\x00";

function contentWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= MIN_WORD_LEN);
}

function buildTrigrams(words: string[]): Set<string> {
  const trigrams = new Set<string>();
  for (let i = 0; i + 2 < words.length; i++) {
    trigrams.add(`${words[i]}${TRIGRAM_SEPARATOR}${words[i + 1]}${TRIGRAM_SEPARATOR}${words[i + 2]}`);
  }
  return trigrams;
}

export type GroundingResult = {
  grounded: boolean;
  /** "no_context" when no chunks were retrieved; "trigram_match" or "no_match" otherwise. */
  reason: "no_context" | "trigram_match" | "no_match";
  /** First matched trigram (space-joined), if any. */
  matchedTrigram?: string;
};

/**
 * Check whether `answer` is grounded in at least one of the `chunks`.
 * Returns a typed result so callers can log or metric-emit the reason.
 */
export function checkAnswerGrounding(
  answer: string,
  chunks: Array<{ content: string }>
): GroundingResult {
  if (!chunks.length) {
    return { grounded: false, reason: "no_context" };
  }

  const answerWords = contentWords(answer);
  const answerTrigrams = buildTrigrams(answerWords);

  for (const chunk of chunks) {
    const chunkTrigrams = buildTrigrams(contentWords(chunk.content));
    for (const trigram of chunkTrigrams) {
      if (answerTrigrams.has(trigram)) {
        return {
          grounded: true,
          reason: "trigram_match",
          matchedTrigram: trigram.split(TRIGRAM_SEPARATOR).join(" "),
        };
      }
    }
  }

  return { grounded: false, reason: "no_match" };
}
