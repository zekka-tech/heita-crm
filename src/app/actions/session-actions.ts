"use server";

import { signOut } from "@/lib/auth";
import { requireCsrfFormData } from "@/lib/csrf";

export async function signOutCurrentSessionAction(formData: FormData) {
  await requireCsrfFormData(formData);
  await signOut({ redirectTo: "/sign-in" });
}
