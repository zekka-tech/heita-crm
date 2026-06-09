import { redirect } from "next/navigation";
import { Sparkles } from "lucide-react";

import { createBusinessAction } from "@/app/onboard/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/badge";
import { Input, Select, Textarea } from "@/components/ui/input";
import { OnboardTracker } from "@/components/onboarding/onboard-tracker";
import { CsrfField } from "@/components/security/csrf-field";
import { auth } from "@/lib/auth";
import {
  businessCategories,
  formatEnumLabel,
  provinces
} from "@/lib/business";

export const metadata = { title: "Onboard a business" };
export const dynamic = "force-dynamic";

export default async function OnboardPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/sign-in?callbackUrl=/onboard");
  }

  return (
    <main className="px-4 pb-24 pt-6 sm:px-8">
      <Card variant="surface" className="mx-auto max-w-3xl space-y-6">
        <header className="space-y-3">
          <Chip variant="primary" size="sm">
            <Sparkles className="h-3 w-3" /> Onboarding
          </Chip>
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink">
            Create a new business
          </h1>
          <p className="max-w-xl text-sm leading-6 text-ink-muted">
            We&apos;ll provision your owner role, a primary QR code, a join link, and your AI
            workspace. You can create custom loyalty tiers once your programme is set up.
          </p>
        </header>

        <OnboardTracker />

        <form action={createBusinessAction} className="grid gap-5">
          <CsrfField />
          <Input
            label="Business name"
            name="name"
            required
            placeholder="Mpho's Corner Store"
          />

          <Textarea
            label="Description"
            name="description"
            rows={4}
            placeholder="Tell customers what makes this business worth joining."
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="Category" name="category" defaultValue="" required>
              <option value="" disabled>
                Select category
              </option>
              {businessCategories.map((category) => (
                <option key={category} value={category}>
                  {formatEnumLabel(category)}
                </option>
              ))}
            </Select>

            <Select label="Province" name="province" defaultValue="" required>
              <option value="" disabled>
                Select province
              </option>
              {provinces.map((province) => (
                <option key={province} value={province}>
                  {formatEnumLabel(province)}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Business phone"
              name="phone"
              type="tel"
              placeholder="+27 11 555 1234"
            />
            <Input
              label="Business email"
              name="email"
              type="email"
              placeholder="hello@business.co.za"
            />
          </div>

          <Input
            label="Loyalty signup bonus"
            name="loyaltySignupBonus"
            type="number"
            min={0}
            defaultValue={100}
            hint="Welcome points awarded automatically to new members."
          />

          <Button type="submit" variant="gradient" size="lg">
            Create business
          </Button>
        </form>
      </Card>
    </main>
  );
}
