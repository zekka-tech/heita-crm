/**
 * Golden-set test fixtures for the RAG evaluation harness.
 *
 * Each case has:
 *  - messages:         the conversation turns fed to the retrieval pipeline
 *  - relevantContent:  substrings that MUST appear in a correctly retrieved chunk
 *  - irrelevantContent:decoy text that should score lower than relevant chunks
 *  - expectedKeywords: words that should appear in a well-grounded answer
 *  - scenario:         human-readable description for CI output
 */

import type { ChatTurn } from "@/lib/ai/rag";

export type EvalCase = {
  id: string;
  scenario: string;
  messages: ChatTurn[];
  /** At least one retrieved chunk must contain ALL of these substrings. */
  relevantContent: string[];
  /** Content that should NOT dominate the retrieved results. */
  irrelevantContent: string[];
  /** Words that a grounded answer is expected to contain. */
  expectedKeywords: string[];
};

export const GOLDEN_SET: EvalCase[] = [
  // ── Direct factual questions ─────────────────────────────────────────────
  {
    id: "hours-weekday",
    scenario: "Direct question about weekday opening hours",
    messages: [{ role: "user", content: "What are your opening hours on weekdays?" }],
    relevantContent: ["Monday", "Friday", "08:00", "18:00"],
    irrelevantContent: ["loyalty points", "reward redemption", "WhatsApp"],
    expectedKeywords: ["monday", "friday", "open"],
  },
  {
    id: "hours-weekend",
    scenario: "Weekend hours — tests that hours doc is retrieved over loyalty doc",
    messages: [{ role: "user", content: "Are you open on Saturdays?" }],
    relevantContent: ["Saturday", "09:00", "13:00"],
    irrelevantContent: ["EARN", "REDEEM", "membership tier"],
    expectedKeywords: ["saturday"],
  },
  {
    id: "price-query",
    scenario: "Specific product price lookup",
    messages: [{ role: "user", content: "How much does a 2kg bag of flour cost?" }],
    relevantContent: ["flour", "R", "kg"],
    irrelevantContent: ["opening hours", "phone number", "event"],
    expectedKeywords: ["flour", "r"],
  },
  {
    id: "location",
    scenario: "Physical location question",
    messages: [{ role: "user", content: "Where is the store located?" }],
    relevantContent: ["address", "street", "Johannesburg"],
    irrelevantContent: ["points balance", "reward tier", "membership"],
    expectedKeywords: ["address", "street"],
  },
  {
    id: "contact-number",
    scenario: "Contact phone number",
    messages: [{ role: "user", content: "What is your phone number?" }],
    relevantContent: ["+27", "011", "contact"],
    irrelevantContent: ["opening hours", "loyalty", "event schedule"],
    expectedKeywords: ["contact", "number"],
  },

  // ── Follow-up / multi-turn ───────────────────────────────────────────────
  {
    id: "followup-price",
    scenario: "Follow-up: 'What about' after a product mention",
    messages: [
      { role: "user", content: "Do you sell bread?" },
      { role: "assistant", content: "Yes, we stock a range of fresh breads including white and wholewheat loaves." },
      { role: "user", content: "What about the price?" },
    ],
    relevantContent: ["bread", "R", "loaf"],
    irrelevantContent: ["loyalty tier", "WhatsApp", "event"],
    expectedKeywords: ["bread", "r"],
  },
  {
    id: "followup-pronouns",
    scenario: "Follow-up with pronoun referent requiring contextualisation",
    messages: [
      { role: "user", content: "Tell me about your coffee?" },
      { role: "assistant", content: "We serve freshly brewed Arabica coffee from 07:00 each morning." },
      { role: "user", content: "How much does it cost?" },
    ],
    relevantContent: ["coffee", "R", "price"],
    irrelevantContent: ["grocery", "membership", "reward"],
    expectedKeywords: ["coffee"],
  },
  {
    id: "followup-hours-day",
    scenario: "Follow-up asking specifically about one day after general hours query",
    messages: [
      { role: "user", content: "What are your hours?" },
      { role: "assistant", content: "We are open Monday to Friday 08:00–18:00 and Saturday 09:00–13:00." },
      { role: "user", content: "What about Sunday?" },
    ],
    relevantContent: ["Sunday", "closed"],
    irrelevantContent: ["product", "price", "promotion"],
    expectedKeywords: ["sunday"],
  },

  // ── Loyalty / rewards specific ───────────────────────────────────────────
  {
    id: "earn-rate",
    scenario: "How are loyalty points earned",
    messages: [{ role: "user", content: "How do I earn points at your store?" }],
    relevantContent: ["earn", "points", "purchase", "rand"],
    irrelevantContent: ["opening hours", "phone", "address", "flour"],
    expectedKeywords: ["earn", "points"],
  },
  {
    id: "redeem-rewards",
    scenario: "What can points be redeemed for",
    messages: [{ role: "user", content: "What can I use my points for?" }],
    relevantContent: ["redeem", "reward", "points"],
    irrelevantContent: ["opening hours", "phone number", "location"],
    expectedKeywords: ["redeem", "reward"],
  },
  {
    id: "tier-benefits",
    scenario: "Loyalty tier perks question",
    messages: [{ role: "user", content: "What are the benefits of Gold tier?" }],
    relevantContent: ["Gold", "tier", "benefit", "bonus"],
    irrelevantContent: ["address", "flour", "bread", "coffee"],
    expectedKeywords: ["gold", "tier"],
  },

  // ── No-context / out-of-scope ────────────────────────────────────────────
  {
    id: "no-context-competitor",
    scenario: "Question about a competitor — no relevant chunks exist",
    messages: [{ role: "user", content: "How do you compare to Woolworths?" }],
    relevantContent: [], // nothing should be retrieved above threshold
    irrelevantContent: ["loyalty", "hours", "bread", "coffee"],
    expectedKeywords: [], // model should decline / hedge
  },
  {
    id: "no-context-personal",
    scenario: "Personal question irrelevant to business docs",
    messages: [{ role: "user", content: "What is the meaning of life?" }],
    relevantContent: [],
    irrelevantContent: ["opening hours", "loyalty", "reward"],
    expectedKeywords: [],
  },
  {
    id: "no-context-future",
    scenario: "Question about future unavailable info",
    messages: [{ role: "user", content: "What will your prices be next year?" }],
    relevantContent: [],
    irrelevantContent: ["opening hours", "loyalty tier", "reward"],
    expectedKeywords: [],
  },

  // ── Keyword-heavy (FTS advantage) ────────────────────────────────────────
  {
    id: "sku-lookup",
    scenario: "SKU / product code lookup that embeddings may miss",
    messages: [{ role: "user", content: "Do you stock SKU-4821?" }],
    relevantContent: ["SKU-4821", "stock"],
    irrelevantContent: ["loyalty", "tier", "reward"],
    expectedKeywords: ["sku-4821"],
  },
  {
    id: "promo-code",
    scenario: "Promotion code lookup — exact match wins over semantic",
    messages: [{ role: "user", content: "Is the WINTER25 promo still valid?" }],
    relevantContent: ["WINTER25", "discount", "promo"],
    irrelevantContent: ["opening hours", "membership", "address"],
    expectedKeywords: ["winter25"],
  },

  // ── Long question (self-contained, no contextualisation needed) ──────────
  {
    id: "long-question",
    scenario: "Detailed question ≥120 chars that should NOT be contextualised",
    messages: [
      { role: "user", content: "I am looking for detailed information about the full range of fresh produce you carry including organic options, seasonal availability, and approximate pricing per kilogram." },
    ],
    relevantContent: ["produce", "organic", "fresh", "kg"],
    irrelevantContent: ["loyalty", "membership", "reward"],
    expectedKeywords: ["produce", "organic"],
  },

  // ── Grounding edge cases ─────────────────────────────────────────────────
  {
    id: "grounded-exact",
    scenario: "Answer contains an exact trigram from the chunk — grounding=true",
    messages: [{ role: "user", content: "When do you close?" }],
    relevantContent: ["closes at eighteen hundred", "18:00", "every weekday"],
    irrelevantContent: ["reward", "loyalty", "event"],
    expectedKeywords: ["close", "18:00"],
  },
  {
    id: "grounding-no-chunks",
    scenario: "No chunks retrieved — grounding check returns no_context",
    messages: [{ role: "user", content: "What is the stock price of Tesla?" }],
    relevantContent: [],
    irrelevantContent: ["loyalty", "bread", "hours"],
    expectedKeywords: [],
  },

  // ── Conversation summarisation trigger ───────────────────────────────────
  {
    id: "long-session-reference",
    scenario: "Late question that references something from turn 1 (beyond MAX_HISTORY)",
    messages: [
      // Simulated old turns (would be in older portion after summarisation)
      { role: "user", content: "Do you sell pet food?" },
      { role: "assistant", content: "Yes, we carry a full range of dry and wet pet food for dogs and cats." },
      { role: "user", content: "Great, is it organic?" },
      { role: "assistant", content: "We stock the Natures Menu organic range for both dogs and cats." },
      // Recent turns
      { role: "user", content: "How much is the Natures Menu organic dog food?" },
    ],
    relevantContent: ["Natures Menu", "organic", "dog", "price"],
    irrelevantContent: ["loyalty", "reward", "opening hours"],
    expectedKeywords: ["natures menu", "organic"],
  },
];
