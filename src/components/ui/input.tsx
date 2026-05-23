import * as React from "react";

import { cn } from "@/lib/utils";

type FieldProps = {
  label?: string;
  hint?: string;
  error?: string;
  className?: string;
};

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & FieldProps
>(({ label, hint, error, className, id, ...props }, ref) => {
  const inputId = id ?? React.useId();
  return (
    <div className={cn("label-stack", className)}>
      {label ? (
        <label htmlFor={inputId} className="label">
          {label}
        </label>
      ) : null}
      <input
        ref={ref}
        id={inputId}
        className={cn(
          "input",
          error && "border-danger focus:border-danger focus:shadow-[0_0_0_4px_rgba(220,38,38,0.12)]"
        )}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={hint || error ? `${inputId}-hint` : undefined}
        {...props}
      />
      {error ? (
        <p id={`${inputId}-hint`} className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="text-xs text-ink-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
});
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & FieldProps
>(({ label, hint, error, className, id, ...props }, ref) => {
  const inputId = id ?? React.useId();
  return (
    <div className={cn("label-stack", className)}>
      {label ? (
        <label htmlFor={inputId} className="label">
          {label}
        </label>
      ) : null}
      <textarea
        ref={ref}
        id={inputId}
        className={cn(
          "input min-h-[7rem] resize-y",
          error && "border-danger focus:border-danger"
        )}
        aria-invalid={Boolean(error) || undefined}
        {...props}
      />
      {error ? (
        <p className="text-xs font-medium text-danger">{error}</p>
      ) : hint ? (
        <p className="text-xs text-ink-subtle">{hint}</p>
      ) : null}
    </div>
  );
});
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & FieldProps
>(({ label, hint, error, className, id, children, ...props }, ref) => {
  const inputId = id ?? React.useId();
  return (
    <div className={cn("label-stack", className)}>
      {label ? (
        <label htmlFor={inputId} className="label">
          {label}
        </label>
      ) : null}
      <div className="relative">
        <select
          ref={ref}
          id={inputId}
          className={cn(
            "input appearance-none pr-10",
            error && "border-danger"
          )}
          aria-invalid={Boolean(error) || undefined}
          {...props}
        >
          {children}
        </select>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-ink-subtle"
        >
          ▾
        </span>
      </div>
      {error ? (
        <p className="text-xs font-medium text-danger">{error}</p>
      ) : hint ? (
        <p className="text-xs text-ink-subtle">{hint}</p>
      ) : null}
    </div>
  );
});
Select.displayName = "Select";
