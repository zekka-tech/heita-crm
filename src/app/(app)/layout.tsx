import { BottomNav } from "@/components/layout/bottom-nav";
import { LanguageSwitcher } from "@/components/layout/language-switcher";

export default function CustomerAppLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <main className="px-4 pb-28 pt-6 sm:px-8">
        <div className="mb-4 flex items-center justify-end gap-2">
          <LanguageSwitcher />
        </div>
        {children}
      </main>
      <BottomNav />
    </>
  );
}
