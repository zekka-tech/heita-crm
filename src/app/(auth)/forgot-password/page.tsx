import { PlaceholderPage } from "@/components/shared/placeholder-page";

export default function ForgotPasswordPage() {
  return (
    <div className="w-full max-w-md">
      <PlaceholderPage
        eyebrow="Authentication"
        title="Reset credentials"
        description="Password reset reuses the same OTP delivery pipeline as sign-in. Request a new code on the sign-in screen to recover access."
        primaryHref="/sign-in"
        primaryLabel="Back to sign-in"
      />
    </div>
  );
}
