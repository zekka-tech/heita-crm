import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resetEnvForTests } from "@/lib/env";
import { isPlatformAdmin, platformAdminUserIds } from "@/lib/platform-admin";

const original = process.env.PLATFORM_ADMIN_USER_IDS;

beforeEach(() => {
  resetEnvForTests();
});

afterEach(() => {
  if (original === undefined) delete process.env.PLATFORM_ADMIN_USER_IDS;
  else process.env.PLATFORM_ADMIN_USER_IDS = original;
  resetEnvForTests();
});

describe("platform-admin", () => {
  it("treats no allowlist as no admins (fail-closed)", () => {
    delete process.env.PLATFORM_ADMIN_USER_IDS;
    resetEnvForTests();
    expect(platformAdminUserIds().size).toBe(0);
    expect(isPlatformAdmin("user_1")).toBe(false);
  });

  it("parses a comma-separated allowlist, trimming blanks", () => {
    process.env.PLATFORM_ADMIN_USER_IDS = " user_1 , user_2 ,, ";
    resetEnvForTests();
    expect(platformAdminUserIds()).toEqual(new Set(["user_1", "user_2"]));
    expect(isPlatformAdmin("user_1")).toBe(true);
    expect(isPlatformAdmin("user_2")).toBe(true);
    expect(isPlatformAdmin("user_3")).toBe(false);
  });

  it("returns false for null/undefined/empty user IDs", () => {
    process.env.PLATFORM_ADMIN_USER_IDS = "user_1";
    resetEnvForTests();
    expect(isPlatformAdmin(null)).toBe(false);
    expect(isPlatformAdmin(undefined)).toBe(false);
    expect(isPlatformAdmin("")).toBe(false);
  });
});
