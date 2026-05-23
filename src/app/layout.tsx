import type { Metadata, Viewport } from "next";

import { ServiceWorkerRegister } from "@/components/layout/service-worker-register";
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
    siteName: "Heita"
  }
};

export const viewport: Viewport = {
  themeColor: "#0f1f3d",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
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
        <ServiceWorkerRegister />
        <div className="app-frame">{children}</div>
      </body>
    </html>
  );
}
