import { BusinessCategory, FollowUpStatus, JoinChannel, MessageChannel, Province } from "@prisma/client";
import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { prisma } from "../../src/lib/prisma";
import { createBusinessWithDefaults } from "../../src/server/services/business.service";

test.setTimeout(60_000);

async function readDevOtp(payload: { devCode?: string }, chip: Locator): Promise<string | undefined> {
  if (payload.devCode) return payload.devCode;
  const chipText = await chip.textContent({ timeout: 2_000 }).catch(() => "");
  return (chipText ?? "").match(/(\d{6})/)?.[1];
}

async function signInAs(page: Page, phone: string) {
  await page.context().clearCookies();
  await page.goto("/sign-in");
  await page.getByLabel(/phone number/i).fill(phone);
  const otpResponsePromise = page.waitForResponse((response) =>
    response.url().includes("/api/auth/request-otp") && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: /send.*code/i }).click();
  const otpPayload = (await (await otpResponsePromise).json()) as { devCode?: string };
  const devOtp = await readDevOtp(otpPayload, page.getByText(/Dev OTP:\s*\d{6}/i));
  expect(devOtp).toBeTruthy();
  await page.getByLabel(/verification code|code/i).fill(devOtp!);
  await page.getByRole("button", { name: /verify and sign in|verify sign in/i }).click();
  await page.waitForURL(/\/home/);
}

async function verifyStaffStepUp(page: Page) {
  const stepUpResponsePromise = page.waitForResponse((response) =>
    response.url().includes("/api/auth/request-staff-otp") && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: /send staff otp/i }).click();
  const stepUpPayload = (await (await stepUpResponsePromise).json()) as { devCode?: string };
  const stepUpCode = await readDevOtp(stepUpPayload, page.getByText(/Dev OTP:\s*\d{6}/i));
  expect(stepUpCode).toBeTruthy();
  await page.getByLabel(/verification code/i).fill(stepUpCode!);
  await page.getByRole("button", { name: /verify staff access/i }).click();
  await expect(page.getByText(/staff verification is active/i)).toBeVisible({ timeout: 10_000 });
}

test("paid staff can create a sales thread and approve an in-app follow-up", async ({ page }) => {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 10_000)}`;
  const ownerPhone = `+27837${suffix.slice(-6)}`;
  const customerPhone = `+27838${suffix.slice(-6)}`;
  const threadTitle = `Sales E2E ${suffix}`;
  let businessId: string | undefined;

  const [owner, customer] = await Promise.all([
    prisma.user.create({
      data: { name: `SalesOwner ${suffix}`, phone: ownerPhone, phoneVerifiedAt: new Date() }
    }),
    prisma.user.create({
      data: { name: `SalesCustomer ${suffix}`, phone: customerPhone, phoneVerifiedAt: new Date() }
    })
  ]);

  try {
    const business = await createBusinessWithDefaults({
      userId: owner.id,
      name: `Sales Store ${suffix}`,
      description: "Sales flow test store",
      category: BusinessCategory.OTHER,
      province: Province.GAUTENG,
      loyaltySignupBonus: 0
    });
    businessId = business.id;
    await prisma.business.update({ where: { id: business.id }, data: { planId: "GROWTH" } });

    const membership = await prisma.membership.create({
      data: {
        businessId: business.id,
        userId: customer.id,
        joinChannel: JoinChannel.DIRECT_LINK,
        pointsBalance: 0,
        isActive: true
      }
    });

    await signInAs(page, ownerPhone);
    await page.goto(`/dashboard/${business.id}/sales`);
    await expect(page.getByRole("heading", { name: /sales pipeline/i })).toBeVisible({ timeout: 10_000 });

    await page.getByLabel(/thread title/i).fill(threadTitle);
    await page.getByLabel(/existing member/i).selectOption(membership.id);
    await page.getByLabel(/preferred channel/i).selectOption(MessageChannel.IN_APP);
    await page.getByRole("button", { name: /create thread/i }).click();
    await page.waitForURL(/\/dashboard\/[^/]+\/sales\/[^/?]+/);
    await expect(page.getByRole("heading", { name: threadTitle })).toBeVisible({ timeout: 10_000 });

    const threadId = page.url().match(/\/sales\/([^/?]+)/)?.[1];
    expect(threadId).toBeTruthy();
    const thread = await prisma.salesThread.findFirstOrThrow({
      where: { id: threadId!, businessId: business.id },
      include: { stage: true }
    });

    const task = await prisma.followUpTask.create({
      data: {
        businessId: business.id,
        salesThreadId: thread.id,
        stageId: thread.stageId,
        channel: MessageChannel.IN_APP,
        dueAt: new Date(),
        status: FollowUpStatus.AWAITING_APPROVAL,
        reason: "e2e_seeded_draft",
        aiDraftBody: "Hi, just checking whether you had a chance to review the quote."
      }
    });

    await page.goto(`/dashboard/${business.id}/sales/approvals`);
    await expect(page.getByText(threadTitle)).toBeVisible({ timeout: 10_000 });
    await verifyStaffStepUp(page);

    const approvalForm = page.locator("form", {
      has: page.getByRole("button", { name: /approve and send/i })
    }).first();
    await approvalForm.getByLabel(/draft/i).fill("Approved in-app follow-up from Playwright.");
    await approvalForm.getByRole("button", { name: /approve and send/i }).click();

    await expect.poll(async () => {
      const updatedTask = await prisma.followUpTask.findUniqueOrThrow({ where: { id: task.id } });
      return updatedTask.status;
    }, { timeout: 10_000 }).toBe(FollowUpStatus.SENT);

    const outboundMessage = await prisma.message.findFirst({
      where: {
        businessId: business.id,
        salesThreadId: thread.id,
        channel: MessageChannel.IN_APP,
        direction: "OUTBOUND",
        body: "Approved in-app follow-up from Playwright."
      }
    });
    expect(outboundMessage).toBeTruthy();
  } finally {
    if (businessId) {
      await prisma.followUpTask.deleteMany({ where: { businessId } });
      await prisma.message.deleteMany({ where: { businessId } });
      await prisma.membership.deleteMany({ where: { businessId } });
      await prisma.business.deleteMany({ where: { id: businessId } });
    }
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, customer.id] } } });
  }
});
