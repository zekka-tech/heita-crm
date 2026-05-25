import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { BusinessSwitcher } from "@/components/dashboard/business-switcher";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type DashboardLayoutProps = {
  children: ReactNode;
  params: Promise<{ businessId: string }>;
};

export default async function DashboardLayout({
  children,
  params
}: DashboardLayoutProps) {
  const { businessId } = await params;
  const session = await auth();

  if (!session?.user?.id) {
    redirect(`/sign-in?callbackUrl=/dashboard/${businessId}`);
  }

  const staffMemberships = await prisma.staffMember.findMany({
    where: { userId: session.user.id },
    select: {
      role: true,
      business: {
        select: { id: true, name: true, deletedAt: true }
      }
    },
    orderBy: { joinedAt: "asc" }
  });

  const businesses = staffMemberships
    .filter((membership) => membership.business.deletedAt === null)
    .map((membership) => ({
      id: membership.business.id,
      name: membership.business.name,
      role: membership.role
    }));

  return (
    <>
      {businesses.length > 1 ? (
        <div className="px-4 pt-4 sm:px-8">
          <BusinessSwitcher
            currentBusinessId={businessId}
            businesses={businesses}
          />
        </div>
      ) : null}
      {children}
    </>
  );
}
