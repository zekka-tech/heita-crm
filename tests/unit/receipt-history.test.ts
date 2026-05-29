import { describe, expect, it } from "vitest";

import { formatReceiptHistoryCsv } from "@/server/services/receipt-history.service";

describe("formatReceiptHistoryCsv", () => {
  it("escapes values and emits a CSV header", () => {
    const csv = formatReceiptHistoryCsv({
      businessName: 'Acme "Retail"',
      transactions: [
        {
          createdAt: new Date("2026-06-01T10:00:00Z"),
          type: "EARN",
          description: 'In-store "purchase"',
          pointsDelta: 120,
          expiresAt: null
        }
      ]
    });

    expect(csv).toContain('"business","date","type","description","pointsDelta","expiresAt"');
    expect(csv).toContain('"Acme ""Retail"""');
    expect(csv).toContain('"In-store ""purchase"""');
  });

  it("guards against CSV injection by prefixing formula characters with a single quote", () => {
    const formulaPayloads = ["=CMD", "+malicious", "-formula", "@function", "\tfield", "\rfield"];
    const csv = formatReceiptHistoryCsv({
      businessName: "Safe Business",
      transactions: formulaPayloads.map((desc, i) => ({
        createdAt: new Date("2026-06-01T10:00:00Z"),
        type: "EARN",
        description: desc,
        pointsDelta: i,
        expiresAt: null
      }))
    });

    // Each formula-starting cell must begin with a single-quote prefix
    expect(csv).toContain("'=CMD");
    expect(csv).toContain("'+malicious");
    expect(csv).toContain("'-formula");
    expect(csv).toContain("'@function");
    // Tab and CR are also guarded
    expect(csv).toContain("'\t");
    expect(csv).toContain("'\r");
    // Regular descriptions must NOT be prefixed
    expect(csv).not.toMatch(/"'Safe Business"/);
  });
});
