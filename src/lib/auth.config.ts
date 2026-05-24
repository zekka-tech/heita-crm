import type { NextAuthConfig } from "next-auth";

export const authBaseConfig = {
  providers: [],
  session: {
    strategy: "jwt"
  },
  trustHost: true,
  pages: {
    signIn: "/sign-in",
    error: "/sign-in"
  },
  callbacks: {
    jwt({ token, user, trigger, session }) {
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

      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = typeof token.id === "string" ? token.id : token.sub ?? "";
        session.user.phone = typeof token.phone === "string" ? token.phone : null;
        session.user.phoneVerifiedAt =
          typeof token.phoneVerifiedAt === "string" ? token.phoneVerifiedAt : null;
        session.user.sessionVersion =
          typeof token.sessionVersion === "number" ? token.sessionVersion : 0;
      }

      return session;
    }
  }
} satisfies NextAuthConfig;
