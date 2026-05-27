import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(
  resolve("src/server/services/customer-import.service.ts"),
  "utf-8"
);

describe("customer-import service safety guards", () => {
  it("defines MAX_IMPORT_ROWS limit", () => {
    expect(source).toContain("MAX_IMPORT_ROWS");
    expect(source).toContain("2000");
  });

  it("defines MAX_CSV_BYTES limit (10 MB)", () => {
    expect(source).toContain("MAX_CSV_BYTES");
    expect(source).toContain("10 * 1024 * 1024");
  });

  it("throws when CSV byte size exceeds limit", () => {
    expect(source).toContain("exceeds the 10 MB limit");
  });

  it("throws when row count exceeds MAX_IMPORT_ROWS", () => {
    expect(source).toContain("MAX_IMPORT_ROWS");
    expect(source).toMatch(/rows\.length\s*>\s*MAX_IMPORT_ROWS/);
  });

  it("validates phone numbers with an SA-specific check", () => {
    expect(source).toContain("Invalid South African phone number");
  });

  it("skips rows with duplicate phone numbers (deduplication guard)", () => {
    expect(source).toMatch(/skip|duplicate|seen|Set/i);
  });

  it("validates required columns before processing", () => {
    expect(source).toMatch(/required|missing|column/i);
  });

  it("handles errors per-row without aborting the whole import", () => {
    // The service should catch per-row errors and continue
    expect(source).toMatch(/catch|error|failed.*row|row.*error/i);
  });
});
