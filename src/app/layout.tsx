import type { Metadata, Viewport } from "next";
import dynamic from "next/dynamic";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";

import { Toaster } from "sonner";

import { HeitaTRPCProvider } from "@/components/providers/trpc-provider";
import { CookieConsentBanner } from "@/components/layout/cookie-consent-banner";
import { PwaInstallBanner } from "@/components/layout/pwa-install-banner";
import { ServiceWorkerRegister } from "@/components/layout/service-worker-register";

// Analytics providers — lazy so they never block first paint and are absent
// when NEXT_PUBLIC_POSTHOG_KEY is unset (e.g. CI, staging without tracking).
const PostHogProvider = dynamic(
  () => import("@/components/providers/posthog-provider").then((m) => m.PostHogProvider),
  { ssr: false }
);
const WebVitalsReporter = dynamic(
  () => import("@/components/providers/web-vitals").then((m) => m.WebVitalsReporter),
  { ssr: false }
);
import { resolveLocale } from "@/i18n/locale";
import "./globals.css";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://heita.co.za";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: "Heita — loyalty & messaging for South African retailers",
    template: "%s · Heita"
  },
  description:
    "A mobile-first PWA CRM that connects retailers and small businesses with their customers through QR, WhatsApp, AI workspaces, and loyalty rewards.",
  manifest: "/manifest.json",
  applicationName: "Heita CRM",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Heita"
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.svg", sizes: "192x192", type: "image/svg+xml" },
      { url: "/icons/icon-512.svg", sizes: "512x512", type: "image/svg+xml" }
    ]
  },
  alternates: {
    languages: {
      "en-ZA": APP_URL,
      zu: APP_URL,
      xh: APP_URL,
      af: APP_URL,
      "x-default": APP_URL
    }
  },
  openGraph: {
    type: "website",
    title: "Heita CRM",
    description:
      "Loyalty, messaging, and AI workspaces for South African retailers.",
    siteName: "Heita",
    images: [{ url: "/opengraph-image" }]
  },
  twitter: {
    card: "summary_large_image",
    title: "Heita CRM",
    description:
      "Loyalty, messaging, and AI workspaces for South African retailers.",
    images: ["/opengraph-image"]
  }
};

export const viewport: Viewport = {
  themeColor: "#0f1f3d",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover"
};

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await resolveLocale();
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <head>
        {/* iOS home screen icon — requires PNG, SVGs are not used by Safari */}
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/icon-180.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Poppins:wght@500;600;700;800&display=swap"
        />
      </head>
      <body>
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <HeitaTRPCProvider>
            <PostHogProvider />
            <WebVitalsReporter />
            <ServiceWorkerRegister />
            <PwaInstallBanner />
            <CookieConsentBanner />
            <div id="main-content" className="app-frame">
              {children}
            </div>
            <Toaster position="bottom-center" offset="5rem" richColors closeButton />
          </HeitaTRPCProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
