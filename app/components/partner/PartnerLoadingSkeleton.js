export function PartnerLoadingSkeleton({ rows = 4 }) {
  return (
    <div className="space-y-4 animate-pulse">
      {" "}
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="rounded-2xl border admin-panel-border ui-glass-5 p-4"
        >
          {" "}
          <div className="h-4 w-1/3 rounded ui-glass-10" />{" "}
          <div className="mt-3 h-8 w-1/2 rounded ui-glass-10" />{" "}
          <div className="mt-2 h-3 w-2/3 rounded ui-glass-5" />{" "}
        </div>
      ))}{" "}
    </div>
  );
}
export function PartnerMetricSkeletonGrid({ count = 8 }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 animate-pulse">
      {" "}
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="rounded-2xl border admin-panel-border ui-glass-5 p-5"
        >
          {" "}
          <div className="h-3 w-24 rounded ui-glass-10" />{" "}
          <div className="mt-4 h-7 w-20 rounded ui-glass-10" />{" "}
        </div>
      ))}{" "}
    </div>
  );
}
