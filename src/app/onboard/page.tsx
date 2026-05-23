import { auth } from "@/lib/auth";
import {
  businessCategories,
  formatEnumLabel,
  provinces
} from "@/lib/business";
import { createBusinessAction } from "@/app/onboard/actions";
import { redirect } from "next/navigation";

export default async function OnboardPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/sign-in?callbackUrl=/onboard");
  }

  return (
    <main className="px-4 py-6 sm:px-8">
      <section className="surface mx-auto max-w-3xl rounded-[2rem] p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#af5f33]">
          Business Onboarding
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#143127]">
          Create a new business
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#456356]">
          This creates the business, owner staff membership, default Bronze/Silver/Gold
          tiers, a primary QR code, a primary join link, and the AI workspace.
        </p>

        <form action={createBusinessAction} className="mt-8 grid gap-4">
          <label className="grid gap-2 text-sm text-[#143127]">
            Business name
            <input
              name="name"
              required
              className="rounded-2xl border border-[rgba(20,49,39,0.14)] bg-white px-4 py-3 outline-none"
              placeholder="Mpho's Corner Store"
            />
          </label>

          <label className="grid gap-2 text-sm text-[#143127]">
            Description
            <textarea
              name="description"
              rows={4}
              className="rounded-2xl border border-[rgba(20,49,39,0.14)] bg-white px-4 py-3 outline-none"
              placeholder="Tell customers what makes this business worth joining."
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm text-[#143127]">
              Category
              <select
                name="category"
                required
                className="rounded-2xl border border-[rgba(20,49,39,0.14)] bg-white px-4 py-3 outline-none"
                defaultValue=""
              >
                <option value="" disabled>
                  Select category
                </option>
                {businessCategories.map((category) => (
                  <option key={category} value={category}>
                    {formatEnumLabel(category)}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm text-[#143127]">
              Province
              <select
                name="province"
                required
                className="rounded-2xl border border-[rgba(20,49,39,0.14)] bg-white px-4 py-3 outline-none"
                defaultValue=""
              >
                <option value="" disabled>
                  Select province
                </option>
                {provinces.map((province) => (
                  <option key={province} value={province}>
                    {formatEnumLabel(province)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm text-[#143127]">
              Business phone
              <input
                name="phone"
                className="rounded-2xl border border-[rgba(20,49,39,0.14)] bg-white px-4 py-3 outline-none"
                placeholder="+27 11 555 1234"
              />
            </label>

            <label className="grid gap-2 text-sm text-[#143127]">
              Business email
              <input
                name="email"
                type="email"
                className="rounded-2xl border border-[rgba(20,49,39,0.14)] bg-white px-4 py-3 outline-none"
                placeholder="hello@business.co.za"
              />
            </label>
          </div>

          <label className="grid gap-2 text-sm text-[#143127]">
            Loyalty signup bonus
            <input
              name="loyaltySignupBonus"
              type="number"
              min="0"
              defaultValue="100"
              className="rounded-2xl border border-[rgba(20,49,39,0.14)] bg-white px-4 py-3 outline-none"
            />
          </label>

          <button
            type="submit"
            className="rounded-full bg-[#1d3c34] px-5 py-3 text-sm font-medium text-[#f9f6f1]"
          >
            Create business
          </button>
        </form>
      </section>
    </main>
  );
}
