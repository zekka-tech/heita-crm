import { JoinChannel } from "@prisma/client";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type JoinResolverPageProps = {
  params: Promise<{ token: string }>;
};

export default async function JoinResolverPage({ params }: JoinResolverPageProps) {
  const { token } = await params;
  const session = await auth();
  const qrCode = await prisma.qrCode.findUnique({
    where: { token },
    include: { business: true }
  });

  if (qrCode) {
    await prisma.qrCode.update({
      where: { id: qrCode.id },
      data: { scanCount: { increment: 1 } }
    });

    if (!session?.user?.id) {
      redirect(`/sign-in?callbackUrl=/b/${qrCode.business.slug}/join?channel=${JoinChannel.QR_CODE}`);
    }

    redirect(`/b/${qrCode.business.slug}/join?channel=${JoinChannel.QR_CODE}`);
  }

  const joinLink = await prisma.joinLink.findUnique({
    where: { token },
    include: { business: true }
  });

  if (joinLink) {
    await prisma.joinLink.update({
      where: { id: joinLink.id },
      data: { clickCount: { increment: 1 } }
    });

    if (!session?.user?.id) {
      redirect(`/sign-in?callbackUrl=/b/${joinLink.business.slug}/join?channel=${joinLink.channel}`);
    }

    redirect(`/b/${joinLink.business.slug}/join?channel=${joinLink.channel}`);
  }

  notFound();
}
