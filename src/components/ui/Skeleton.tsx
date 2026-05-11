import { cn } from "@/utils/cn";

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "shimmer rounded-xl bg-brand-steel/60 dark:bg-white/5",
        className
      )}
    />
  );
}
