export function SkeletonBlock({ className = "" }) {
  return (
    <div className={`admin-skeleton-block animate-pulse rounded-2xl admin-panel ${className}`} />
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-8 opacity-100 transition-opacity duration-500">
      <SkeletonBlock className="h-44 w-full rounded-[34px]" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <SkeletonBlock key={index} className="h-36 rounded-[28px]" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <SkeletonBlock className="h-96 rounded-[28px] xl:col-span-1" />
        <SkeletonBlock className="h-96 rounded-[28px] xl:col-span-2" />
      </div>
      <SkeletonBlock className="h-[420px] rounded-[28px]" />
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div className="space-y-6 opacity-100 transition-opacity duration-500">
      <SkeletonBlock className="h-28 rounded-[28px]" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <SkeletonBlock key={index} className="h-28 rounded-[24px]" />
        ))}
      </div>
      <SkeletonBlock className="h-80 rounded-[28px]" />
    </div>
  );
}
