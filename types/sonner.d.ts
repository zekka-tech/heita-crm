// Stub type declarations for `sonner`.
// Replace with the real package once networking is available:
//   npm install sonner
declare module "sonner" {
  import type { FC } from "react";

  export interface ToasterProps {
    position?:
      | "top-left"
      | "top-right"
      | "bottom-left"
      | "bottom-right"
      | "top-center"
      | "bottom-center";
    richColors?: boolean;
    closeButton?: boolean;
    theme?: "light" | "dark" | "system";
    className?: string;
  }

  export const Toaster: FC<ToasterProps>;

  type ToastOptions = {
    id?: string | number;
    duration?: number;
    description?: string;
  };

  export const toast: {
    (message: string, options?: ToastOptions): string | number;
    success(message: string, options?: ToastOptions): string | number;
    error(message: string, options?: ToastOptions): string | number;
    warning(message: string, options?: ToastOptions): string | number;
    info(message: string, options?: ToastOptions): string | number;
    promise<T>(
      promise: Promise<T>,
      options: { loading: string; success: string; error: string }
    ): Promise<T>;
    dismiss(id?: string | number): void;
  };
}
