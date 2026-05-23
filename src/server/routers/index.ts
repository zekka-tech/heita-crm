import { router } from "@/server/trpc";
import { aiRouter } from "@/server/routers/ai";
import { businessRouter } from "@/server/routers/business";
import { eventsRouter } from "@/server/routers/events";
import { loyaltyRouter } from "@/server/routers/loyalty";
import { membershipRouter } from "@/server/routers/membership";
import { messagingRouter } from "@/server/routers/messaging";
import { promotionsRouter } from "@/server/routers/promotions";

export const appRouter = router({
  ai: aiRouter,
  business: businessRouter,
  events: eventsRouter,
  loyalty: loyaltyRouter,
  membership: membershipRouter,
  messaging: messagingRouter,
  promotions: promotionsRouter
});

export type AppRouter = typeof appRouter;

