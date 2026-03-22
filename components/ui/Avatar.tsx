type Size = "sm" | "md" | "lg";

interface AvatarProps {
  src?: string;
  name: string;
  size?: Size;
  className?: string;
}

const sizeClass: Record<Size, string> = {
  sm: "w-6 h-6 text-[10px]",
  md: "w-8 h-8 text-xs",
  lg: "w-10 h-10 text-sm",
};

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

export function Avatar({ src, name, size = "md", className = "" }: AvatarProps) {
  const sz = sizeClass[size];

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={`${sz} rounded-full object-cover ${className}`}
      />
    );
  }

  return (
    <div
      className={`${sz} rounded-full flex items-center justify-center font-medium shrink-0 ${className}`}
      style={{ background: "var(--color-bg-surface-2)", border: "1px solid var(--color-border-hover)", color: "var(--color-text-secondary)" }}
    >
      {getInitials(name)}
    </div>
  );
}
