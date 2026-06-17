import type { Route } from "next";
import { JoinChannel } from "@prisma/client";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { withSystemScope } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type JoinResolverPageProps = {
  params: Promise<{ token: string }>;
};

export default async function JoinResolverPage({ params }: JoinResolverPageProps) {
  const { token } = await params;
  const session = await auth();

  // QrCode/JoinLink are tenant-scoped (FORCE RLS) with no public-read policy, so
  // this public token resolver must run under the explicit system scope. The
  // read + scan/click increment happen inside the scope; the redirect (which
  // throws NEXT_REDIRECT) is issued AFTER so it can't roll back the increment.
  const resolved = await withSystemScope(async (tx) => {
    const qrCode = await tx.qrCode.findUnique({
      where: { token },
      include: { business: true }
    });
    if (qrCode) {
      await tx.qrCode.update({
        where: { id: qrCode.id },
        data: { scanCount: { increment: 1 } }
      });
      return { slug: qrCode.business.slug, channel: JoinChannel.QR_CODE };
    }

    const joinLink = await tx.joinLink.findUnique({
      where: { token },
      include: { business: true }
    });
    if (joinLink) {
      await tx.joinLink.update({
        where: { id: joinLink.id },
        data: { clickCount: { increment: 1 } }
      });
      return { slug: joinLink.business.slug, channel: joinLink.channel };
    }

    return null;
  });

  if (!resolved) notFound();

  const callbackUrl = `/b/${resolved.slug}/join?channel=${resolved.channel}`;
  if (!session?.user?.id) {
    redirect(`/sign-in?callbackUrl=${callbackUrl}` as Route);
  }
  redirect(callbackUrl as Route);
}
