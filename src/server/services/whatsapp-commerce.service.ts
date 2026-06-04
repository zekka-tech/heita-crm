import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { sendWhatsAppInteractiveListMessage, sendWhatsAppTextMessage } from "@/lib/whatsapp";

export async function sendRewardsCatalog(input: {
  phoneNumberId: string;
  to: string;
  businessId: string;
  businessName: string;
}) {
  const rewards = await prisma.reward.findMany({
    where: {
      businessId: input.businessId,
      isActive: true,
      stock: { gt: 0 }
    },
    select: {
      id: true,
      title: true,
      pointsCost: true,
      description: true
    },
    orderBy: { pointsCost: "asc" },
    take: 10
  });

  if (rewards.length === 0) {
    return sendWhatsAppTextMessage({
      phoneNumberId: input.phoneNumberId,
      to: input.to,
      body: `No rewards are currently available at ${input.businessName}. Check back soon!`
    });
  }

  return sendWhatsAppInteractiveListMessage({
    phoneNumberId: input.phoneNumberId,
    to: input.to,
    body: `*${input.businessName} Rewards*\nBrowse available rewards you can redeem with your points.`,
    buttonLabel: "View rewards",
    sectionTitle: `Available (${rewards.length})`,
    footer: "Reply with a reward number to redeem.",
    rows: rewards.map((r, i) => ({
      id: `reward_${r.id}`,
      title: `${i + 1}. ${r.title}`,
      description: `${r.pointsCost.toLocaleString()} pts — ${r.description?.slice(0, 40) ?? ""}`
    }))
  });
}

export async function handleCommerceCommand(input: {
  phoneNumberId: string;
  to: string;
  body: string;
  businessId: string;
  businessName: string;
  userId: string;
}): Promise<{ handled: boolean; reply?: string }> {
  const normalized = input.body.trim().toLowerCase();

  if (
    normalized === "rewards" ||
    normalized === "catalog" ||
    normalized === "redeem" ||
    normalized === "browse" ||
    normalized.startsWith("what can i get") ||
    normalized.startsWith("show rewards") ||
    normalized.startsWith("view rewards")
  ) {
    try {
      await sendRewardsCatalog({
        phoneNumberId: input.phoneNumberId,
        to: input.to,
        businessId: input.businessId,
        businessName: input.businessName
      });
      return { handled: true };
    } catch (error) {
      logger.error({ err: error }, "whatsapp.commerce.catalog_failed");
      return { handled: true, reply: "Sorry, I couldn't load the rewards catalog right now. Please try again later." };
    }
  }

  if (normalized.startsWith("redeem ")) {
    const rewardIndex = parseInt(normalized.replace("redeem ", "").trim(), 10);
    if (isNaN(rewardIndex)) {
      return {
        handled: true,
        reply: "Which reward would you like to redeem? Reply with the reward number (e.g. 'redeem 1')."
      };
    }

    try {
      const reward = await prisma.reward.findFirst({
        where: { businessId: input.businessId, isActive: true, stock: { gt: 0 } },
        orderBy: { pointsCost: "asc" },
        skip: rewardIndex - 1,
        take: 1,
        select: { id: true, title: true, pointsCost: true }
      });

      if (!reward) {
        return {
          handled: true,
          reply: "That reward number is not available. Reply 'rewards' to see the catalog."
        };
      }

      return {
        handled: true,
        reply: `To redeem *${reward.title}* (${reward.pointsCost.toLocaleString()} points), open the app or visit your rewards page. Reply 'rewards' to browse again.`
      };
    } catch (error) {
      logger.error({ err: error }, "whatsapp.commerce.redeem_failed");
      return { handled: true, reply: "Sorry, something went wrong. Please try again later." };
    }
  }

  return { handled: false };
}
