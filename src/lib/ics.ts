const DEFAULT_EVENT_DURATION_MINUTES = 60;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function formatUtcTimestamp(value: Date) {
  return [
    value.getUTCFullYear(),
    pad(value.getUTCMonth() + 1),
    pad(value.getUTCDate())
  ].join("") +
    "T" +
    [pad(value.getUTCHours()), pad(value.getUTCMinutes()), pad(value.getUTCSeconds())].join("") +
    "Z";
}

function escapeIcsText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function foldIcsLine(line: string) {
  const chunks: string[] = [];

  for (let index = 0; index < line.length; index += 73) {
    const chunk = line.slice(index, index + 73);
    chunks.push(index === 0 ? chunk : ` ${chunk}`);
  }

  return chunks.join("\r\n");
}

export type EventCalendarInput = {
  id: string;
  title: string;
  description?: string | null;
  location?: string | null;
  startsAt: Date;
  endsAt?: Date | null;
  businessName: string;
  businessSlug: string;
};

export function buildEventIcs(input: EventCalendarInput) {
  const createdAt = new Date();
  const startsAt = input.startsAt;
  const endsAt =
    input.endsAt ??
    new Date(input.startsAt.getTime() + DEFAULT_EVENT_DURATION_MINUTES * 60_000);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://heita.co.za";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Heita//CRM//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    foldIcsLine(`X-WR-CALNAME:${escapeIcsText(input.businessName)}`),
    "BEGIN:VEVENT",
    foldIcsLine(`UID:${escapeIcsText(input.id)}@heita.co.za`),
    `DTSTAMP:${formatUtcTimestamp(createdAt)}`,
    `DTSTART:${formatUtcTimestamp(startsAt)}`,
    `DTEND:${formatUtcTimestamp(endsAt)}`,
    foldIcsLine(`SUMMARY:${escapeIcsText(input.title)}`),
    foldIcsLine(
      `DESCRIPTION:${escapeIcsText(
        input.description?.trim() ||
          `${input.businessName} event in Heita CRM.`
      )}`
    ),
    foldIcsLine(`LOCATION:${escapeIcsText(input.location?.trim() || input.businessName)}`),
    foldIcsLine(
      `URL:${escapeIcsText(`${appUrl}/b/${input.businessSlug}/events`)}`
    ),
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR"
  ];

  return `${lines.join("\r\n")}\r\n`;
}

export function buildEventIcsFilename(title: string) {
  const slug = title
    .toLowerCase()
    .replace(/[\r\n]+/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return `${slug || "heita-event"}.ics`;
}
