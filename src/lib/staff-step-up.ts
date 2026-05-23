import { OtpPurpose } from "@prisma/client";

import { issueOtpCode, verifyOtpAttempt } from "@/lib/otp";
import { getRedis } from "@/lib/redis";

const STAFF_STEP_UP_WINDOW_SECONDS = 15 * 60;
const memoryStore = new Map<string, number>();

function getStepUpKey(userId: string, businessId: string) {
  return `staff-step-up:${userId}:${businessId}`;
}

function getMemoryStepUpExpiry(key: string): number | null {
  const expiresAt = memoryStore.get(key);
  if (!expiresAt) {
    return null;
  }

  if (expiresAt <= Date.now()) {
    memoryStore.delete(key);
    return null;
  }

  return expiresAt;
}

export async function requestStaffStepUpOtp(input: { phone: string }) {
  return issueOtpCode({
    phone: input.phone,
    purpose: OtpPurpose.STAFF_STEP_UP
  });
}

export async function verifyStaffStepUpOtp(input: {
  userId: string;
  businessId: string;
  phone: string;
  code: string;
}) {
  const verified = await verifyOtpAttempt({
    phone: input.phone,
    code: input.code,
    purpose: OtpPurpose.STAFF_STEP_UP
  });

  if (!verified) {
    return false;
  }

  const redis = getRedis();
  const key = getStepUpKey(input.userId, input.businessId);

  if (!redis) {
    memoryStore.set(key, Date.now() + STAFF_STEP_UP_WINDOW_SECONDS * 1000);
    return true;
  }

  try {
    await redis.set(key, "1", "EX", STAFF_STEP_UP_WINDOW_SECONDS);
  } catch {
    memoryStore.set(key, Date.now() + STAFF_STEP_UP_WINDOW_SECONDS * 1000);
  }

  return true;
}

export async function hasFreshStaffStepUp(input: {
  userId: string;
  businessId: string;
}) {
  const key = getStepUpKey(input.userId, input.businessId);
  const redis = getRedis();

  if (!redis) {
    return Boolean(getMemoryStepUpExpiry(key));
  }

  try {
    const value = await redis.get(key);
    if (value) {
      return true;
    }
  } catch {
    return Boolean(getMemoryStepUpExpiry(key));
  }

  return false;
}

export async function requireFreshStaffStepUp(input: {
  userId: string;
  businessId: string;
}) {
  const fresh = await hasFreshStaffStepUp(input);

  if (!fresh) {
    throw new Error("A fresh staff verification code is required before changing business data.");
  }
}
