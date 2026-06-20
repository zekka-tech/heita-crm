"use server";

import { BusinessCategory, Prisma, Province } from "@prisma/client";
import { redirect } from "next/navigation";

import { signIn, signOut } from "@/lib/auth";
import { requireCsrfFormData } from "@/lib/csrf";
import { logger } from "@/lib/logger";
import { prisma, withUserScope } from "@/lib/prisma";
import { createBusinessWithDefaults } from "@/server/services/business.service";

const DEV_TEST_USER = {
  name: "Heita Dev Tester",
  email: "dev-tester@heita.local",
  phone: "+27110000000"
} as const;
const DEV_SANDBOX_NAME = "Heita Dev Sandbox";
const DEV_SANDBOX_EMAIL = "sandbox@heita.local";
const DEV_SANDBOX_MARKER = "DEV_BYPASS_SANDBOX";
const DEV_DB_UNAVAILABLE_REDIRECT = "/sign-in?devError=db-unavailable";

function isNextRedirectError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.startsWith("NEXT_REDIRECT") ||
      Boolean((error as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")))
  );
}

function isDatabaseUnavailableError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return true;
  }

  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P1001" || error.code === "P1002")
  ) {
    return true;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("can't reach database server") ||
    message.includes("connection refused") ||
    message.includes("connect econnrefused")
  );
}

export async function devBypassSignInAction(formData: FormData) {
  if (process.env.NODE_ENV === "production" || process.env.ENABLE_DEV_AUTH_BYPASS !== "true") {
    redirect("/sign-in");
  }

  await requireCsrfFormData(formData);

  try {
    const verifiedAt = new Date();
    const user = await prisma.user.upsert({
      where: { email: DEV_TEST_USER.email },
      create: {
        name: DEV_TEST_USER.name,
        email: DEV_TEST_USER.email,
        phone: DEV_TEST_USER.phone,
        phoneVerifiedAt: verifiedAt
      },
      update: {
        name: DEV_TEST_USER.name,
        phone: DEV_TEST_USER.phone,
        phoneVerifiedAt: verifiedAt,
        deletedAt: null
      },
      select: {
        id: true
      }
    });

    // StaffMember is business-scoped with a user-self-read policy; scope by the
    // signing-in user so RLS resolves their own memberships under the app role.
    const existingStaffMembership = await withUserScope(user.id, (tx) =>
      tx.staffMember.findFirst({
        where: {
          userId: user.id,
          business: {
            deletedAt: null
          }
        },
        select: {
          businessId: true
        },
        orderBy: {
          joinedAt: "asc"
        }
      })
    );

    const businessId =
      existingStaffMembership?.businessId ??
      (
        await createBusinessWithDefaults({
          userId: user.id,
          name: DEV_SANDBOX_NAME,
          description: DEV_SANDBOX_MARKER,
          category: BusinessCategory.OTHER,
          province: Province.GAUTENG,
          phone: "+27115551234",
          email: DEV_SANDBOX_EMAIL,
          loyaltySignupBonus: 100
        })
      ).id;

    await signIn("dev-bypass", {
      userId: user.id,
      redirectTo: `/dashboard/${businessId}`
    });
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }
    if (isDatabaseUnavailableError(error)) {
      logger.error({ err: error }, "auth.dev_bypass.db_unavailable");
      redirect(DEV_DB_UNAVAILABLE_REDIRECT);
    }
    throw error;
  }
}

export async function devSignOutAndResetAction(formData: FormData) {
  if (process.env.NODE_ENV === "production") {
    redirect("/sign-in");
  }

  await requireCsrfFormData(formData);

  try {
    const user = await prisma.user.findUnique({
      where: { email: DEV_TEST_USER.email },
      select: { id: true }
    });

    if (user) {
      const businesses = await prisma.business.findMany({
        where: {
          OR: [
            { description: DEV_SANDBOX_MARKER },
            { email: DEV_SANDBOX_EMAIL },
            { name: DEV_SANDBOX_NAME }
          ],
          staffMembers: {
            some: { userId: user.id }
          }
        },
        select: { id: true }
      });

      const businessIds = businesses.map((business) => business.id);

      await prisma.$transaction(async (tx) => {
        if (businessIds.length > 0) {
          await tx.business.deleteMany({
            where: { id: { in: businessIds } }
          });
        }

        await tx.otpCode.deleteMany({
          where: {
            OR: [{ userId: user.id }, { phone: DEV_TEST_USER.phone }]
          }
        });

        await tx.user.delete({
          where: { id: user.id }
        });
      });
    } else {
      await prisma.otpCode.deleteMany({
        where: { phone: DEV_TEST_USER.phone }
      });
    }

    await signOut({ redirectTo: "/sign-in?devReset=1" });
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }
    if (isDatabaseUnavailableError(error)) {
      logger.error({ err: error }, "auth.dev_reset.db_unavailable");
      redirect(DEV_DB_UNAVAILABLE_REDIRECT);
    }
    throw error;
  }
}
