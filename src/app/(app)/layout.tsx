import { BottomNav } from "@/components/layout/bottom-nav";
import { PwaInstallBanner } from "@/components/layout/pwa-install-banner";

export default function CustomerAppLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <PwaInstallBanner />
      <main className="px-4 pb-28 pt-6 sm:px-8">{children}</main>
      <BottomNav />
    </>
  );
}

