import { HTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

type CardProps = {
  hover?: boolean;
  light?: boolean;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
} & Omit<HTMLAttributes<HTMLDivElement>, "onClick">;

export function Card({ hover = false, light = false, children, className = "", onClick, ...props }: CardProps) {
  const base = light ? "card-light" : hover ? "card-hover" : "card";

  if (onClick) {
    return (
      <button onClick={onClick} className={`${base} cursor-pointer ${className} text-left w-full`}>
        {children}
      </button>
    );
  }

  return (
    <div className={`${base} ${className}`} {...props}>
      {children}
    </div>
  );
}
