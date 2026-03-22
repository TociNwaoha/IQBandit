interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = "" }: SkeletonProps) {
  return (
    <div className={`animate-pulse rounded-lg ${className}`} style={{ background: "var(--color-bg-surface-2)" }} />
  );
}
