import { signOutCurrentSessionAction } from "@/app/actions/session-actions";
import { CsrfField } from "@/components/security/csrf-field";
import { Button } from "@/components/ui/button";

type SignOutButtonFormProps = {
  className?: string;
  buttonClassName?: string;
  label?: string;
  variant?: "primary" | "secondary" | "ghost" | "gradient" | "danger";
  size?: "sm" | "md" | "lg";
};

export function SignOutButtonForm({
  className,
  buttonClassName,
  label = "Log out",
  variant = "ghost",
  size = "sm"
}: SignOutButtonFormProps) {
  return (
    <form action={signOutCurrentSessionAction} className={className}>
      <CsrfField />
      <Button type="submit" variant={variant} size={size} className={buttonClassName}>
        {label}
      </Button>
    </form>
  );
}
