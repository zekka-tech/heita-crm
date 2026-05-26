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
});
