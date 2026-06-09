"use client";

import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import {
  MAX_SEGMENT_RULES,
  SEGMENT_FIELDS,
  operatorsForFieldType,
  type SegmentFieldType
} from "@/lib/segments";

type RuleRow = {
  field: string;
  operator: string;
  value: string;
};

const FIELD_TYPE = new Map<string, SegmentFieldType>(
  SEGMENT_FIELDS.map((field) => [field.value, field.type])
);

function newRow(): RuleRow {
  const field = SEGMENT_FIELDS[0]!;
  return { field: field.value, operator: "eq", value: "" };
}

/**
 * Client-side rule builder. Manages rule rows + match mode and serializes them
 * into a hidden `rules` input so the surrounding server-rendered form (which
 * carries the CSRF token) can POST them to `createSegmentAction`.
 */
export function SegmentBuilder() {
  const [rows, setRows] = useState<RuleRow[]>([newRow()]);
  const [matchAll, setMatchAll] = useState(true);

  const serialized = useMemo(
    () =>
      JSON.stringify({
        matchAll,
        rules: rows.map((row) => ({
          field: row.field,
          operator: row.operator,
          value: row.value
        }))
      }),
    [rows, matchAll]
  );

  function updateRow(index: number, patch: Partial<RuleRow>) {
    setRows((current) =>
      current.map((row, i) => {
        if (i !== index) return row;
        const next = { ...row, ...patch };
        // If the field type changed to text, drop numeric-only operators.
        const validOps = operatorsForFieldType(
          FIELD_TYPE.get(next.field) ?? "text"
        );
        if (!validOps.some((op) => op.value === next.operator)) {
          next.operator = validOps[0]!.value;
        }
        return next;
      })
    );
  }

  function removeRow(index: number) {
    setRows((current) =>
      current.length === 1 ? current : current.filter((_, i) => i !== index)
    );
  }

  return (
    <div className="space-y-4">
      <input type="hidden" name="rules" value={serialized} />

      <div className="flex items-center gap-2 text-sm">
        <span className="text-ink-muted">Match</span>
        <Select
          aria-label="Match mode"
          value={matchAll ? "all" : "any"}
          onChange={(event) => setMatchAll(event.target.value === "all")}
          className="w-auto"
        >
          <option value="all">all rules (AND)</option>
          <option value="any">any rule (OR)</option>
        </Select>
      </div>

      <div className="space-y-3">
        {rows.map((row, index) => {
          const fieldType = FIELD_TYPE.get(row.field) ?? "text";
          const operators = operatorsForFieldType(fieldType);
          return (
            <div
              key={index}
              className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]"
            >
              <Select
                aria-label="Field"
                value={row.field}
                onChange={(event) => updateRow(index, { field: event.target.value })}
              >
                {SEGMENT_FIELDS.map((field) => (
                  <option key={field.value} value={field.value}>
                    {field.label}
                  </option>
                ))}
              </Select>
              <Select
                aria-label="Operator"
                value={row.operator}
                onChange={(event) => updateRow(index, { operator: event.target.value })}
              >
                {operators.map((operator) => (
                  <option key={operator.value} value={operator.value}>
                    {operator.label}
                  </option>
                ))}
              </Select>
              <Input
                aria-label="Value"
                value={row.value}
                inputMode={fieldType === "number" ? "numeric" : "text"}
                placeholder={fieldType === "number" ? "0" : "value"}
                onChange={(event) => updateRow(index, { value: event.target.value })}
              />
              <Button
                type="button"
                variant="ghost"
                aria-label="Remove rule"
                disabled={rows.length === 1}
                onClick={() => removeRow(index)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          );
        })}
      </div>

      {rows.length < MAX_SEGMENT_RULES ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setRows((current) => [...current, newRow()])}
        >
          <Plus className="h-4 w-4" />
          Add rule
        </Button>
      ) : null}
    </div>
  );
}
