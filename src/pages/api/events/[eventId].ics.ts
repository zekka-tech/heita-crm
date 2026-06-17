import type { NextApiRequest, NextApiResponse } from "next";

import { buildEventIcs, buildEventIcsFilename } from "@/lib/ics";
import { withSystemScope } from "@/lib/prisma";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const rawEventId = req.query.eventId;
  const eventId = Array.isArray(rawEventId) ? rawEventId[0] : rawEventId;

  if (!eventId) {
    return res.status(400).json({ error: "Event id is required." });
  }

  // Event is tenant-scoped (FORCE RLS) with no public-read policy; this public
  // ICS feed resolves an event by its public id before any business scope is
  // known, so it must run under the explicit system scope. The business
  // active/not-deleted filter preserves the public-surface guarantee.
  const event = await withSystemScope((tx) =>
    tx.event.findFirst({
      where: {
        id: eventId,
        business: {
          deletedAt: null,
          isActive: true
        }
      },
      include: {
        business: {
          select: {
            name: true,
            slug: true
          }
        }
      }
    })
  );

  if (!event) {
    return res.status(404).json({ error: "Event not found." });
  }

  const ics = buildEventIcs({
    id: event.id,
    title: event.title,
    description: event.description,
    location: event.location,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    businessName: event.business.name,
    businessSlug: event.business.slug
  });

  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${buildEventIcsFilename(event.title)}"`
  );
  return res.status(200).send(ics);
}
