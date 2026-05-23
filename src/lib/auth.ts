import { PrismaAdapter } from "@auth/prisma-adapter";
import { OtpPurpose } from "@prisma/client";
import NextAuth, { type NextAuthConfig } from "next-auth";
import Apple from "next-auth/providers/apple";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";

import { authBaseConfig } from "@/lib/auth.config";
import { verifyOtpAttempt } from "@/lib/otp";
import { prisma } from "@/lib/prisma";

export async function authorizePhoneOtpSignIn(input: {
  phone: string;
  code: string;
}) {
  const phone = input.phone.trim();
  const code = input.code.trim();

  if (!phone || !code) {
    return null;
  }

  const verified = await verifyOtpAttempt({
    phone,
    code,
    purpose: OtpPurpose.SIGN_IN
  });

  if (!verified) {
    return null;
  }

  const user =
    (await prisma.user.findUnique({
      where: {
        phone
      }
    })) ??
    (await prisma.user.create({
      data: {
        name: `Heita User ${phone.slice(-4)}`,
        phone
      }
    }));

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
    phone: user.phone
  };
}

const providers: NonNullable<NextAuthConfig["providers"]> = [
  Credentials({
    id: "phone-otp",
    name: "Phone OTP",
    credentials: {
      phone: { label: "Phone", type: "tel" },
      code: { label: "Code", type: "text" }
    },
    async authorize(credentials) {
      return authorizePhoneOtpSignIn({
        phone: String(credentials?.phone ?? ""),
        code: String(credentials?.code ?? "")
      });
    }
  })
];

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET
    })
  );
}

if (process.env.AUTH_APPLE_ID && process.env.AUTH_APPLE_SECRET) {
  providers.push(
    Apple({
      clientId: process.env.AUTH_APPLE_ID,
      clientSecret: process.env.AUTH_APPLE_SECRET
    })
  );
}

export const authConfig = {
  ...authBaseConfig,
  adapter: PrismaAdapter(prisma),
  providers
} satisfies NextAuthConfig;

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
