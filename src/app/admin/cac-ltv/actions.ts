"use server";

import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { requireCsrfFormData } from "@/lib/csrf";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { AdSpendValidationError, recordAdSpend } from "@/server/services/ad-spend.service";

export async function recordAdSpendAction(formData: FormData) {
  await requireCsrfFormData(formData);

  const session = await auth();
  if (!isPlatformAdmin(session?.user?.id)) {
    redirect("/");
  }

  const channel = String(formData.get("channel") ?? "").trim();
  const periodStart = new Date(String(formData.get("periodStart") ?? ""));
  const periodEnd = new Date(String(formData.get("periodEnd") ?? ""));
  const amountZar = Number(formData.get("amountZar") ?? NaN);
  const note = String(formData.get("note") ?? "").trim() || null;

  try {
    await recordAdSpend({ channel, periodStart, periodEnd, amountZar, note });
  } catch (error) {
    if (error instanceof AdSpendValidationError) {
      redirect(`/admin/cac-ltv?error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }

  redirect("/admin/cac-ltv?recorded=1");
}
