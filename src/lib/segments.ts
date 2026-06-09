// Shared, dependency-free segment metadata + validation. Imported by both the
// client-side segment builder and the server action, so it must NOT import any
// server-only modules (prisma, etc.). The SQL mapping lives in
// `segment.service.ts`; the field keys here must stay in sync with its FIELD_MAP.

export type SegmentRule = {
  field: string;
  operator: string;
  value: string | number;
};

export type SegmentRules = {
  rules: SegmentRule[];
  matchAll: boolean;
};

export type SegmentFieldType = "number" | "text";

export type SegmentFieldMeta = {
  value: string;
  label: string;
  type: SegmentFieldType;
};

export const SEGMENT_FIELDS: readonly SegmentFieldMeta[] = [
  { value: "pointsBalance", label: "Points balance", type: "number" },
  { value: "totalSpent", label: "Total points earned", type: "number" },
  { value: "visitCount", label: "Visit count", type: "number" },
  { value: "lastVisitDaysAgo", label: "Days since last visit", type: "number" },
  { value: "tier", label: "Tier name", type: "text" },
  { value: "joinChannel", label: "Join channel", type: "text" },
  { value: "province", label: "Province", type: "text" }
] as const;

export type SegmentOperatorMeta = {
  value: string;
  label: string;
  numericOnly: boolean;
};

export const SEGMENT_OPERATORS: readonly SegmentOperatorMeta[] = [
  { value: "eq", label: "is", numericOnly: false },
  { value: "not_eq", label: "is not", numericOnly: false },
  { value: "gt", label: "greater than", numericOnly: true },
  { value: "gte", label: "at least", numericOnly: true },
  { value: "lt", label: "less than", numericOnly: true },
  { value: "lte", label: "at most", numericOnly: true }
] as const;

export const MAX_SEGMENT_RULES = 10;

const FIELD_TYPES = new Map(SEGMENT_FIELDS.map((f) => [f.value, f.type]));
const OPERATOR_KEYS = new Set(SEGMENT_OPERATORS.map((o) => o.value));
const NUMERIC_ONLY_OPERATORS = new Set(
  SEGMENT_OPERATORS.filter((o) => o.numericOnly).map((o) => o.value)
);

/** Operators valid for a given field type (text fields only support equality). */
export function operatorsForFieldType(
  type: SegmentFieldType
): readonly SegmentOperatorMeta[] {
  return type === "number"
    ? SEGMENT_OPERATORS
    : SEGMENT_OPERATORS.filter((o) => !o.numericOnly);
}

/**
 * Validate and normalize untrusted rule input (e.g. parsed JSON from a form).
 * Throws an Error with a user-facing message on any problem; returns clean
 * rules (numeric values coerced to number, text trimmed) on success.
 */
export function validateSegmentRules(input: unknown): SegmentRules {
  if (typeof input !== "object" || input === null) {
    throw new Error("Add at least one rule to define the segment.");
  }

  const candidate = input as { rules?: unknown; matchAll?: unknown };
  const matchAll = candidate.matchAll !== false; // default to AND

  if (!Array.isArray(candidate.rules) || candidate.rules.length === 0) {
    throw new Error("Add at least one rule to define the segment.");
  }
  if (candidate.rules.length > MAX_SEGMENT_RULES) {
    throw new Error(`A segment can have at most ${MAX_SEGMENT_RULES} rules.`);
  }

  const rules: SegmentRule[] = candidate.rules.map((raw, index) => {
    const position = index + 1;
    if (typeof raw !== "object" || raw === null) {
      throw new Error(`Rule ${position} is incomplete.`);
    }
    const { field, operator, value } = raw as Record<string, unknown>;

    const fieldType = typeof field === "string" ? FIELD_TYPES.get(field) : undefined;
    if (!fieldType) {
      throw new Error(`Rule ${position} uses an unknown field.`);
    }
    if (typeof operator !== "string" || !OPERATOR_KEYS.has(operator)) {
      throw new Error(`Rule ${position} uses an unknown operator.`);
    }
    if (fieldType === "text" && NUMERIC_ONLY_OPERATORS.has(operator)) {
      throw new Error(
        `Rule ${position}: "${operator}" can only be used with numeric fields.`
      );
    }

    if (fieldType === "number") {
      const numeric = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(numeric)) {
        throw new Error(`Rule ${position} needs a numeric value.`);
      }
      return { field: field as string, operator, value: numeric };
    }

    const text = typeof value === "string" ? value.trim() : "";
    if (!text) {
      throw new Error(`Rule ${position} needs a value.`);
    }
    return { field: field as string, operator, value: text };
  });

  return { rules, matchAll };
}
