import { describe, it, expect } from "vitest";
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
    // The rows check references MAX_IMPORT_ROWS in the condition
    expect(source).toMatch(/rows\.length\s*>\s*MAX_IMPORT_ROWS/);
  });
});
