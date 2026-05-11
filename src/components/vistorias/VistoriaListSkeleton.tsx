import { Skeleton } from "@/components/ui/Skeleton";

export function VistoriaListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-start gap-3 rounded-2xl border border-brand-steel/70 bg-white p-3.5 shadow-soft"
        >
          <Skeleton className="h-[68px] w-[68px] rounded-2xl" />
          <div className="flex-1 space-y-2.5">
            <div className="flex gap-2">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-5 w-14" />
            </div>
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <div className="flex justify-between pt-1">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-7 w-24 rounded-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
