import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";

import { HeitaTRPCProvider } from "@/components/providers/trpc-provider";
import { CookieConsentBanner } from "@/components/layout/cookie-consent-banner";
import { PwaInstallBanner } from "@/components/layout/pwa-install-banner";
import { ServiceWorkerRegister } from "@/components/layout/service-worker-register";
import { resolveLocale } from "@/i18n/locale";
import "./globals.css";

export const metadata: Metadata = {
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
  maximumScale: 5
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
            <ServiceWorkerRegister />
            <PwaInstallBanner />
            <CookieConsentBanner />
            <div id="main-content" className="app-frame">
              {children}
            </div>
          </HeitaTRPCProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
