import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function VerifyOtpPage() {
  return (
    <section className="surface w-full rounded-[2rem] p-6 sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#af5f33]">
        Authentication
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#143127]">
        Verify phone OTP
      </h1>
      <p className="mt-3 text-sm leading-6 text-[#456356]">
        OTP verification is now handled directly from the sign-in and sign-up pages.
        Use this screen as a fallback handoff point if you need to restart the flow.
      </p>
      <div className="mt-6">
        <Button asChild>
          <Link href="/sign-in">Return to sign-in</Link>
        </Button>
      </div>
    </section>
  );
}
