import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: { default: "Dashboard", template: "%s · Heita Dashboard" },
  robots: { index: false }
};

import { BusinessSwitcher } from "@/components/dashboard/business-switcher";
import {
  DashboardBottomNav,
  DashboardSidebarNav
} from "@/components/dashboard/dashboard-bottom-nav";
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
    <div className="flex min-h-screen">
      <DashboardSidebarNav businessId={businessId} />

      <div className="flex min-w-0 flex-1 flex-col">
        {businesses.length > 1 ? (
          <div className="border-b border-line px-4 py-3 sm:px-8">
            <BusinessSwitcher
              currentBusinessId={businessId}
              businesses={businesses}
            />
          </div>
        ) : null}

        <main className="flex-1 pb-20 lg:pb-0">{children}</main>
      </div>

      <DashboardBottomNav businessId={businessId} />
    </div>
  );
}
