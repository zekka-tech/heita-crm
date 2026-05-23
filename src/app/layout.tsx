import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Heita CRM",
  description: "Communication-first loyalty CRM for South African retailers.",
  manifest: "/manifest.json",
  applicationName: "Heita CRM",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Heita"
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <div className="app-frame">{children}</div>
      </body>
    </html>
  );
}

