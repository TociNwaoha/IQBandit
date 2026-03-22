interface SeparatorProps {
  light?: boolean;
  className?: string;
}

export function Separator({ light = false, className = "" }: SeparatorProps) {
  return (
    <div className={`${light ? "divider-light" : "divider"} ${className}`} />
  );
}
