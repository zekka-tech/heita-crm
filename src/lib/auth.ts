import { ConsentType } from "@prisma/client";
import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth, { type NextAuthConfig } from "next-auth";
import Apple from "next-auth/providers/apple";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";

import { authBaseConfig } from "@/lib/auth.config";
import { getOtpPurposeForMode, isAuthOtpMode, type AuthOtpMode } from "@/lib/auth-intent";
import { logger } from "@/lib/logger";
import { verifyOtpAttempt } from "@/lib/otp";
import { normalizeZaPhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { recordConsent } from "@/server/services/account.service";

const CREDENTIAL_ATTEMPTS_PER_HOUR = 10;
const CREDENTIAL_BURST_PER_MINUTE = 5;

async function rateLimitCredentialAttempt(phone: string): Promise<boolean> {
  const burst = await enforceRateLimit({
    identifier: `auth:credential-burst:${phone}`,
    windowSeconds: 60,
    max: CREDENTIAL_BURST_PER_MINUTE
  });
  if (!burst.allowed) {
    logger.warn({ phone: phone.slice(-4) }, "auth.credential.rate_limited_burst");
    return false;
  }
  const hourly = await enforceRateLimit({
    identifier: `auth:credential-hour:${phone}`,
    windowSeconds: 3600,
    max: CREDENTIAL_ATTEMPTS_PER_HOUR
  });
  if (!hourly.allowed) {
    logger.warn({ phone: phone.slice(-4) }, "auth.credential.rate_limited_hourly");
    return false;
  }
  return true;
}

export async function authorizePhoneOtp(input: {
  phone: string;
  code: string;
  mode: AuthOtpMode;
  acceptTerms?: boolean;
}) {
  const phone = normalizeZaPhone(input.phone.trim());
  const code = input.code.trim();

  if (!phone || !code) {
    return null;
  }

  if (!(await rateLimitCredentialAttempt(phone))) {
    return null;
  }

  const verified = await verifyOtpAttempt({
    phone,
    code,
    purpose: getOtpPurposeForMode(input.mode)
  });

  if (!verified) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: {
      phone
    }
  });

  if (input.mode === "sign-in") {
    if (!user?.phoneVerifiedAt || user.deletedAt) {
      return null;
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      phone: user.phone,
      phoneVerifiedAt: user.phoneVerifiedAt?.toISOString() ?? null,
      sessionVersion: user.sessionVersion
    };
  }

  if (!input.acceptTerms) {
    return null;
  }

  if (user?.phoneVerifiedAt) {
    return null;
  }

  if (user?.deletedAt) {
    return null;
  }

  const verifiedUser =
    user ??
    (await prisma.user.create({
      data: {
        name: `Heita User ${phone.slice(-4)}`,
        phone
      }
    }));

  if (!verifiedUser.phoneVerifiedAt) {
    await prisma.user.update({
      where: {
        id: verifiedUser.id
      },
      data: {
        phoneVerifiedAt: new Date()
      }
    });
  }

  await Promise.all([
    recordConsent({
      userId: verifiedUser.id,
      type: ConsentType.TERMS_OF_SERVICE,
      source: "sign-up"
    }),
    recordConsent({
      userId: verifiedUser.id,
      type: ConsentType.PRIVACY_POLICY,
      source: "sign-up"
    })
  ]);

  return {
    id: verifiedUser.id,
    name: verifiedUser.name,
    email: verifiedUser.email,
    image: verifiedUser.image,
    phone: verifiedUser.phone,
    phoneVerifiedAt: new Date().toISOString(),
    sessionVersion: verifiedUser.sessionVersion
  };
}

const providers: NonNullable<NextAuthConfig["providers"]> = [
  Credentials({
    id: "phone-otp",
    name: "Phone OTP",
    credentials: {
      phone: { label: "Phone", type: "tel" },
      code: { label: "Code", type: "text" },
      mode: { label: "Mode", type: "text" },
      acceptTerms: { label: "Accept terms", type: "text" }
    },
    async authorize(credentials) {
      const mode = String(credentials?.mode ?? "sign-in");
      if (!isAuthOtpMode(mode)) {
        return null;
      }

      return authorizePhoneOtp({
        phone: String(credentials?.phone ?? ""),
        code: String(credentials?.code ?? ""),
        mode,
        acceptTerms: String(credentials?.acceptTerms ?? "") === "true"
      });
    }
  })
];

if (process.env.NODE_ENV !== "production") {
  providers.push(
    Credentials({
      id: "dev-bypass",
      name: "Dev Bypass",
      credentials: {
        userId: { label: "User ID", type: "text" }
      },
      async authorize(credentials) {
        const userId = String(credentials?.userId ?? "").trim();
        if (!userId) return null;
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user || user.deletedAt) return null;
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          phone: user.phone,
          phoneVerifiedAt: (user.phoneVerifiedAt ?? new Date()).toISOString(),
          sessionVersion: user.sessionVersion
        };
      }
    })
  );
}

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      allowDangerousEmailAccountLinking: false,
      authorization: {
        params: {
          scope: "openid email profile"
        }
      }
    })
  );
}

if (process.env.AUTH_APPLE_ID && process.env.AUTH_APPLE_SECRET) {
  providers.push(
    Apple({
      clientId: process.env.AUTH_APPLE_ID,
      clientSecret: process.env.AUTH_APPLE_SECRET,
      allowDangerousEmailAccountLinking: false,
      authorization: {
        params: {
          scope: "name email"
        }
      }
    })
  );
}

export const authConfig = {
  ...authBaseConfig,
  adapter: PrismaAdapter(prisma),
  providers,
  callbacks: {
    ...authBaseConfig.callbacks,
    async signIn({ user, account, profile }) {
      // OAuth providers: detect email collision with an existing phone-OTP
      // account that has not yet linked the same provider. NextAuth will not
      // silently merge accounts (allowDangerousEmailAccountLinking is false),
      // so we redirect with an explicit error code the sign-in page can
      // explain to the user.
      if (account?.type !== "oauth") return true;

      const email = (profile?.email ?? user.email)?.toLowerCase();
      if (!email) {
        // Most providers always return an email; if not, refuse rather than
        // silently create an account with no contact identity.
        return "/sign-in?error=OAuthEmailMissing";
      }

      const existingUser = await prisma.user.findUnique({
        where: { email },
        include: {
          accounts: {
            select: { provider: true }
          }
        }
      });

      if (!existingUser) return true;
      if (existingUser.deletedAt) {
        return "/sign-in?error=AccountDeactivated";
      }
      const alreadyLinked = existingUser.accounts.some(
        (record) => record.provider === account.provider
      );
      if (!alreadyLinked) {
        // A phone-OTP (or other-provider) account already exists. Require an
        // explicit account-linking flow before joining the OAuth identity.
        return "/sign-in?error=OAuthAccountLinkRequired";
      }

      return true;
    },
    async jwt({ token, user, trigger, session, account }) {
      void account;

      if (user) {
        token.id = user.id;
        token.phone =
          "phone" in user && typeof user.phone === "string" ? user.phone : null;
        token.phoneVerifiedAt =
          "phoneVerifiedAt" in user && typeof user.phoneVerifiedAt === "string"
            ? user.phoneVerifiedAt
            : null;
        token.sessionVersion =
          "sessionVersion" in user && typeof user.sessionVersion === "number"
            ? user.sessionVersion
            : 0;
      }

      if (trigger === "update" && session && typeof session === "object") {
        if (
          "sessionVersion" in session &&
          typeof session.sessionVersion === "number"
        ) {
          token.sessionVersion = session.sessionVersion;
        }
      }

      if (token.id && typeof token.sessionVersion !== "number") {
        const record = await prisma.user.findUnique({
          where: { id: String(token.id) },
          select: { sessionVersion: true, deletedAt: true }
        });
        if (record && !record.deletedAt) {
          token.sessionVersion = record.sessionVersion;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = typeof token.id === "string" ? token.id : token.sub ?? "";
        session.user.phone = typeof token.phone === "string" ? token.phone : null;
        session.user.phoneVerifiedAt =
          typeof token.phoneVerifiedAt === "string" ? token.phoneVerifiedAt : null;
        session.user.sessionVersion =
          typeof token.sessionVersion === "number" ? token.sessionVersion : 0;
      }

      if (session.user?.id) {
        const record = await prisma.user.findUnique({
          where: { id: session.user.id },
          select: { sessionVersion: true, deletedAt: true }
        });

        const tokenVersion = typeof token.sessionVersion === "number" ? token.sessionVersion : null;
        const revoked =
          !record ||
          record.deletedAt !== null ||
          (tokenVersion !== null && tokenVersion !== record.sessionVersion);

        if (revoked) {
          if (record && tokenVersion !== null && tokenVersion !== record.sessionVersion) {
            logger.info(
              { userId: session.user.id },
              "auth.session.revoked_version_mismatch"
            );
          }
          // Wipe identity claims so downstream auth() handlers treat the
          // session as anonymous and redirect through sign-in again.
          session.user.id = "";
          session.user.phone = null;
          session.user.phoneVerifiedAt = null;
          session.user.sessionVersion = 0;
        }
      }

      return session;
    }
  }
} satisfies NextAuthConfig;

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
