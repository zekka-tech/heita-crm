import { cookies } from "next/headers";

import { CSRF_COOKIE, CSRF_FORM_FIELD, isValidCsrfToken } from "@/lib/csrf";

/**
 * Hidden form field that ships the CSRF token alongside a server action POST.
 * Pair with `requireCsrfFormData(formData)` inside the action handler.
 */
export async function CsrfField() {
  const store = await cookies();
  const value = store.get(CSRF_COOKIE)?.value ?? "";
  const token = isValidCsrfToken(value) ? value : "";

  return <input type="hidden" name={CSRF_FORM_FIELD} value={token} />;
}
