"use server";

import { JoinChannel } from "@prisma/client";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { joinBusiness } from "@/server/services/membership.service";

export async function joinBusinessAction(formData: FormData) {
  const session = await auth();
  const userId = session?.user?.id;

  const businessId = String(formData.get("businessId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const channelValue = String(formData.get("channel") ?? JoinChannel.DIRECT_LINK);
  const channel = Object.values(JoinChannel).includes(channelValue as JoinChannel)
    ? (channelValue as JoinChannel)
    : JoinChannel.DIRECT_LINK;

  if (!userId) {
    redirect(`/sign-in?callbackUrl=/b/${slug}/join`);
  }

  await joinBusiness({
    businessId,
    userId,
    joinChannel: channel
  });

  redirect(`/home?joined=${slug}`);
}

