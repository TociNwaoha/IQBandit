"use client";

import { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "primary-light" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children: ReactNode;
}

const variantClass: Record<Variant, string> = {
  "primary":       "btn-primary",
  "primary-light": "btn-primary-light",
  "secondary":     "btn-secondary",
  "ghost":         "btn-ghost",
  "danger":        "btn-danger",
};

const sizeClass: Record<Size, string> = {
  sm: "!px-3 !py-1.5 !text-xs",
  md: "",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  children,
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={`${variantClass[variant]} ${sizeClass[size]} ${className}`}
    >
      {loading && (
        <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      )}
      {children}
    </button>
  );
}
