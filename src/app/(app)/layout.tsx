import { BottomNav } from "@/components/layout/bottom-nav";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { readCsrfCookie } from "@/lib/csrf";

export default async function CustomerAppLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const csrfToken = await readCsrfCookie();

  return (
    <>
      <main className="px-4 pb-28 pt-6 sm:px-8">
        <div className="mb-4 flex items-center justify-end gap-2">
          <LanguageSwitcher serverToken={csrfToken} />
        </div>
        {children}
      </main>
      <BottomNav />
    </>
  );
}
