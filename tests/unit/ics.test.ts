import { describe, expect, it } from "vitest";

import { buildEventIcs, buildEventIcsFilename } from "@/lib/ics";

describe("buildEventIcs", () => {
  it("renders a valid calendar payload with escaped fields", () => {
    const ics = buildEventIcs({
      id: "evt_1",
      title: "Launch, Market; Day",
      description: "Fresh deals\nall day",
      location: "Main Shop; Sandton",
      startsAt: new Date("2026-06-01T10:00:00Z"),
      endsAt: new Date("2026-06-01T12:00:00Z"),
      businessName: "Acme Retail",
      businessSlug: "acme-retail"
    });

    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("UID:evt_1@heita.co.za");
    expect(ics).toContain("DTSTART:20260601T100000Z");
    expect(ics).toContain("DTEND:20260601T120000Z");
    expect(ics).toContain("SUMMARY:Launch\\, Market\\; Day");
    expect(ics).toContain("DESCRIPTION:Fresh deals\\nall day");
    expect(ics).toContain("LOCATION:Main Shop\\; Sandton");
    expect(ics).toContain("END:VCALENDAR");
  });

  it("falls back to a one-hour default end time and safe filename", () => {
    const ics = buildEventIcs({
      id: "evt_2",
      title: "Saturday Market",
      startsAt: new Date("2026-06-01T10:00:00Z"),
      businessName: "Acme Retail",
      businessSlug: "acme-retail"
    });

    expect(ics).toContain("DTSTART:20260601T100000Z");
    expect(ics).toContain("DTEND:20260601T110000Z");
    expect(buildEventIcsFilename("Saturday Market")).toBe("saturday-market.ics");
  });
});
