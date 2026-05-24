import { PhoneOtpAuthForm } from "@/components/auth/phone-otp-auth-form";
import { turnstileSiteKey } from "@/lib/turnstile";

export default function SignUpPage() {
  return (
    <PhoneOtpAuthForm
      mode="sign-up"
      googleEnabled={Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET)}
      appleEnabled={Boolean(process.env.AUTH_APPLE_ID && process.env.AUTH_APPLE_SECRET)}
      turnstileSiteKey={turnstileSiteKey()}
    />
  );
}
