import { SkeletonBlock } from "../Skeleton";

export function EmailOpsKpiSkeleton({ count = 7 }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonBlock key={i} className="h-28 rounded-[24px]" />
      ))}
    </div>
  );
}

export function EmailOpsTableSkeleton({ rows = 5 }) {
  return (
    <div className="space-y-3">
      <SkeletonBlock className="h-12 rounded-[20px]" />
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonBlock key={i} className="h-16 rounded-[20px]" />
      ))}
    </div>
  );
}

export function EmailOpsDetailSkeleton() {
  return (
    <div className="space-y-6">
      <SkeletonBlock className="h-32 rounded-[28px]" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-24 rounded-[24px]" />
        ))}
      </div>
      <SkeletonBlock className="h-64 rounded-[28px]" />
    </div>
  );
}

export function EmailOpsWizardSkeleton() {
  return (
    <div className="space-y-6">
      <SkeletonBlock className="h-20 rounded-[24px]" />
      <SkeletonBlock className="h-72 rounded-[28px]" />
    </div>
  );
}
