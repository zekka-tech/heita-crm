import { getToken } from "next-auth/jwt";

import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export function normalizeHeaderRecord(
  headers: Headers | Record<string, string | string[] | undefined>
): Record<string, string> {
  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }

  const normalized: Record<string, string> = {};

  for (const [name, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      normalized[name] = value.join(", ");
    } else if (typeof value === "string") {
      normalized[name] = value;
    }
  }

  return normalized;
}

export async function authenticateRequestUser(headers: Headers | Record<string, string | string[] | undefined>) {
  const token = await getToken({
    req: {
      headers: normalizeHeaderRecord(headers)
    },
    secret: env.AUTH_SECRET ?? "heita-dev-auth-secret"
  });

  const userId = typeof token?.id === "string" ? token.id : null;
  const tokenSessionVersion =
    typeof token?.sessionVersion === "number" ? token.sessionVersion : null;

  if (!userId) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      deletedAt: true,
      sessionVersion: true
    }
  });

  const revoked =
    !user ||
    user.deletedAt !== null ||
    (tokenSessionVersion !== null && tokenSessionVersion !== user.sessionVersion);

  if (revoked) {
    return null;
  }

  return {
    userId
  };
}
