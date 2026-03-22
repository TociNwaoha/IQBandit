import { ReactNode } from "react";

type Variant = "success" | "warning" | "error" | "muted" | "brand";

interface BadgeProps {
  variant?: Variant;
  children: ReactNode;
  className?: string;
}

const variantClass: Record<Variant, string> = {
  success: "badge-success",
  warning: "badge-warning",
  error:   "badge-error",
  muted:   "badge-muted",
  brand:   "badge-brand",
};

export function Badge({ variant = "muted", children, className = "" }: BadgeProps) {
  return (
    <span className={`${variantClass[variant]} ${className}`}>
      {children}
    </span>
  );
}
