import type { NextAuthConfig } from "next-auth";

export const authBaseConfig = {
  providers: [],
  session: {
    strategy: "jwt"
  },
  trustHost: true,
  pages: {
    signIn: "/sign-in"
  },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.phone =
          "phone" in user && typeof user.phone === "string" ? user.phone : null;
        token.phoneVerifiedAt =
          "phoneVerifiedAt" in user && typeof user.phoneVerifiedAt === "string"
            ? user.phoneVerifiedAt
            : null;
      }

      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = typeof token.id === "string" ? token.id : token.sub ?? "";
        session.user.phone = typeof token.phone === "string" ? token.phone : null;
        session.user.phoneVerifiedAt =
          typeof token.phoneVerifiedAt === "string" ? token.phoneVerifiedAt : null;
      }

      return session;
    }
  }
} satisfies NextAuthConfig;
