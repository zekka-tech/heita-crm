import { resolve } from "node:path";

import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

const ContentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'" + (isProd ? "" : " 'unsafe-eval'"),
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https: wss: " +
    (isProd ? "" : "ws://localhost:* http://localhost:*"),
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests"
]
  .filter(Boolean)
  .join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: ContentSecurityPolicy },
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
  eslint: {
    ignoreDuringBuilds: true
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }]
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders
      }
    ];
  }
};

export default withNextIntl(nextConfig);
