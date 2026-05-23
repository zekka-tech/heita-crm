import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  asChild?: boolean;
  variant?: "primary" | "secondary" | "ghost";
};

export function Button({
  asChild = false,
  className,
  variant = "primary",
  children,
  ...props
}: ButtonProps) {
  if (asChild && React.isValidElement(children)) {
    const child = children as React.ReactElement<{ className?: string }>;

    return React.cloneElement(child, {
      ...props,
      className: cn(
        "inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-medium transition",
        variant === "primary" &&
          "bg-[#1d3c34] text-[#f9f6f1] hover:bg-[#173128]",
        variant === "secondary" &&
          "border border-[rgba(20,49,39,0.14)] bg-white text-[#143127] hover:bg-[#f7f1e5]",
        variant === "ghost" && "text-[#1d3c34] hover:bg-[rgba(29,60,52,0.08)]",
        child.props.className,
        className
      )
    });
  }

  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-medium transition",
        variant === "primary" &&
          "bg-[#1d3c34] text-[#f9f6f1] hover:bg-[#173128]",
        variant === "secondary" &&
          "border border-[rgba(20,49,39,0.14)] bg-white text-[#143127] hover:bg-[#f7f1e5]",
        variant === "ghost" && "text-[#1d3c34] hover:bg-[rgba(29,60,52,0.08)]",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
