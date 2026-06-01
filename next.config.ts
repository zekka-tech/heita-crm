import { resolve } from "node:path";

import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

// CSP is set per-request in src/middleware.ts using a unique nonce.
// The static headers below cover only the non-CSP security policies.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=(self), payment=()"
  },
  ...(isProd
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload"
        }
      ]
    : [])
];

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  output: "standalone",
  typedRoutes: true,
  poweredByHeader: false,
  reactStrictMode: true,
  outputFileTracingRoot: resolve(import.meta.dirname),
  serverExternalPackages: [
    "ioredis",
    "bullmq",
    "pg",
    "@prisma/client",
    "@prisma/adapter-pg",
    "@aws-sdk/client-s3",
    "@aws-sdk/s3-request-presigner",
    "pdf-parse",
    "mammoth",
    "csv-parse",
    "web-push"
  ],
  experimental: {
    // Tree-shake icon and component libraries so only imported members are bundled.
    optimizePackageImports: [
      "lucide-react",
      "next-intl",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-select",
      "@radix-ui/react-tabs",
      "@radix-ui/react-toast"
    ]
  },
  compiler: isProd
    ? {
        // Strip console.log calls in production; keep warn/error for observability.
        removeConsole: { exclude: ["warn", "error"] }
      }
    : {},
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.amazonaws.com" },
      { protocol: "https", hostname: "*.cloudflare.com" },
      { protocol: "https", hostname: "*.r2.cloudflarestorage.com" },
      { protocol: "https", hostname: "*.googleusercontent.com" },
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      ...(process.env.NODE_ENV === "development" ? [{ protocol: "https" as const, hostname: "**" }] : []),
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders
      }
    ];
  },
  async rewrites() {
    return [{ source: "/sitemap.xml", destination: "/api/sitemap" }];
  }
};

const withIntl = withNextIntl(nextConfig);

export default withSentryConfig(withIntl, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  sourcemaps: { disable: false },
  webpack: {
    treeshake: { removeDebugLogging: true },
    automaticVercelMonitors: false
  }
});
