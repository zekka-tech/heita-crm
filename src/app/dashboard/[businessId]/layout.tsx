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
import { DashboardSWRegister } from "@/components/layout/dashboard-sw-register";
import { OfflineBanner } from "@/components/offline-banner";
import { auth } from "@/lib/auth";
import { getEffectivePlan, isPaidBusinessPlan } from "@/server/services/billing.service";
import { prisma, withUserScope } from "@/lib/prisma";

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

  const staffMemberships = await withUserScope(session.user.id, (tx) =>
    tx.staffMember.findMany({
      where: { userId: session.user.id },
      select: {
        role: true,
        business: {
          select: { id: true, name: true, deletedAt: true }
        }
      },
      orderBy: { joinedAt: "asc" }
    })
  );

  const businesses = staffMemberships
    .filter((membership) => membership.business.deletedAt === null)
    .map((membership) => ({
      id: membership.business.id,
      name: membership.business.name,
      role: membership.role
    }));

  if (!businesses.some((b) => b.id === businessId)) {
    redirect("/home");
  }

  const currentBusiness = await prisma.business.findUnique({
    where: { id: businessId, deletedAt: null },
    select: { isFranchiseHQ: true, planId: true },
  });

  const isFranchiseHQ = currentBusiness?.isFranchiseHQ ?? false;
  // Use the effective plan so past-due/cancelled subscriptions hide the Sales
  // nav even while business.planId still reads paid.
  const hasSalesAccess = isPaidBusinessPlan(await getEffectivePlan(businessId));

  return (
    <div className="flex min-h-screen">
      <DashboardSWRegister />
      <DashboardSidebarNav businessId={businessId} isFranchiseHQ={isFranchiseHQ} hasSalesAccess={hasSalesAccess} />

      <div className="flex min-w-0 flex-1 flex-col">
        <OfflineBanner />
        {businesses.length > 1 ? (
          <div className="border-b border-line px-4 py-3 sm:px-8">
            <BusinessSwitcher
              currentBusinessId={businessId}
              businesses={businesses}
            />
          </div>
        ) : null}

        <main className="flex-1 pb-24 lg:pb-0">{children}</main>
      </div>

      <DashboardBottomNav businessId={businessId} isFranchiseHQ={isFranchiseHQ} hasSalesAccess={hasSalesAccess} />
    </div>
  );
}
