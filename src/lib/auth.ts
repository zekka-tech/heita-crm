import { ConsentType } from "@prisma/client";
import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth, { type NextAuthConfig } from "next-auth";
import Apple from "next-auth/providers/apple";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";

import { authBaseConfig } from "@/lib/auth.config";
import { getOtpPurposeForMode, isAuthOtpMode, type AuthOtpMode } from "@/lib/auth-intent";
import { verifyOtpAttempt } from "@/lib/otp";
import { normalizeZaPhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { recordConsent } from "@/server/services/account.service";

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
      phoneVerifiedAt: user.phoneVerifiedAt?.toISOString() ?? null
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
    phoneVerifiedAt: new Date().toISOString()
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

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
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
  providers
} satisfies NextAuthConfig;

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
