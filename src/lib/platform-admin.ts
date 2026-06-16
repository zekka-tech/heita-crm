import { env } from "@/lib/env";

/**
 * Platform-admin access control for cross-tenant operator surfaces (e.g. the
 * CAC/LTV cohort dashboard).
 *
 * Access is gated by an explicit allowlist of user IDs in the
 * `PLATFORM_ADMIN_USER_IDS` env var (comma-separated). This is deliberately a
 * static allowlist rather than a DB role: platform-admin is an operator concern,
 * not a tenant-staff role, and keeping it out of the tenant data model avoids
 * any chance of a business-scoped user escalating into cross-tenant reporting.
 *
 * With no allowlist configured, nobody is a platform admin (fail-closed).
 */
export function platformAdminUserIds(): Set<string> {
  const raw = env.PLATFORM_ADMIN_USER_IDS ?? "";
  return new Set(
    raw
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
  );
}

export function isPlatformAdmin(userId: string | null | undefined): boolean {
  if (!userId) return false;
  return platformAdminUserIds().has(userId);
}
