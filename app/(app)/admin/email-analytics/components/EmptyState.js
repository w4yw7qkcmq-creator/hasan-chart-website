export function EmptyState({
  title = "لا توجد بيانات بعد",
  description,
  action,
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
      <div className="admin-email-empty-icon relative mb-6 grid h-24 w-24 place-items-center rounded-[28px] border admin-panel-border admin-panel">
        <span className="relative text-5xl">📭</span>
      </div>
      <h3 className="text-2xl font-black admin-text">{title}</h3>
      {description ? (
        <p className="mt-3 max-w-xl text-sm leading-7 admin-text-subtle">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
