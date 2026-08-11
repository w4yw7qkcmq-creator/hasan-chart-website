"use client";

export default function AdminUsersUuidChip({ value, title = "UUID" }) {
  const id = String(value || "").trim();
  if (!id) return <span className="au-user-cell__meta">—</span>;

  const short =
    id.length <= 14 ? id : `${id.slice(0, 8)}…${id.slice(-4)}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(id);
    } catch {
      window.prompt("انسخ UUID:", id);
    }
  };

  return (
    <button
      type="button"
      className="au-code-chip"
      title={`${title}: ${id}`}
      aria-label={`نسخ ${title}`}
      onClick={(event) => {
        event.stopPropagation();
        void copy();
      }}
    >
      {short}
    </button>
  );
}
