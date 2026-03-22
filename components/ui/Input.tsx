"use client";

import { InputHTMLAttributes, useState } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  theme?: "dark" | "light";
  showToggle?: boolean;
}

export function Input({
  label,
  error,
  theme = "dark",
  showToggle = false,
  type,
  className = "",
  id,
  ...props
}: InputProps) {
  const [visible, setVisible] = useState(false);
  const inputClass = theme === "light" ? "input-light" : "input";
  const resolvedType = showToggle && type === "password" ? (visible ? "text" : "password") : type;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={id}
          className={`text-xs font-medium ${theme === "light" ? "text-gray-600" : "text-zinc-400"}`}
        >
          {label}
        </label>
      )}
      <div className="relative">
        <input
          id={id}
          type={resolvedType}
          className={`${inputClass} ${showToggle ? "pr-10" : ""} ${className}`}
          {...props}
        />
        {showToggle && type === "password" && (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 text-xs"
            tabIndex={-1}
          >
            {visible ? "Hide" : "Show"}
          </button>
        )}
      </div>
      {error && (
        <p className={`text-xs ${theme === "light" ? "text-red-600" : "text-red-400"}`}>{error}</p>
      )}
    </div>
  );
}
