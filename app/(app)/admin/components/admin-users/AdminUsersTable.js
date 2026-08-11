"use client";

import Image from "next/image";
import AdminUsersUuidChip from "./AdminUsersUuidChip.js";

function splitDateTime(value) {
  if (!value) return { date: "—", time: "" };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: "—", time: "" };
  return {
    date: new Intl.DateTimeFormat("ar", { dateStyle: "long" }).format(date),
    time: new Intl.DateTimeFormat("ar", { timeStyle: "short" }).format(date),
  };
}

function UserAvatar({ name, avatarUrl }) {
  const initials = String(name || "؟")
    .trim()
    .slice(0, 2)
    .toUpperCase();

  if (avatarUrl) {
    return (
      <Image
        src={avatarUrl}
        alt={name || "المستخدم"}
        width={40}
        height={40}
        className="au-user-cell__avatar"
        unoptimized
      />
    );
  }

  return <span className="au-user-cell__avatar">{initials}</span>;
}

export default function AdminUsersTable({
  users,
  selectedUserIds,
  onToggleSelectAll,
  onToggleSelectUser,
  onOpenUser,
  onOpenQuickPreview,
  allVisibleSelected,
  loading = false,
  AccountStatusBadge,
  SubscriptionStateBadge,
  ExpiredSubscriptionBadge,
  selectedServiceFilter,
}) {
  return (
    <div className="au-table-shell">
      {loading ? <div className="au-table-loading">جاري تحديث الجدول...</div> : null}
      <div className="au-scroll-table">
        <table className="au-table">
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={onToggleSelectAll}
                  aria-label="تحديد الكل"
                />
              </th>
              <th>المستخدم</th>
              <th>البريد</th>
              <th>Telegram / UID</th>
              <th>تاريخ التسجيل</th>
              <th>آخر دخول</th>
              <th>الحالة</th>
              <th>حالة الاشتراك</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const created = splitDateTime(user.createdAt);
              const lastSignIn = splitDateTime(user.lastSignInAt);
              return (
                <tr
                  key={user.id}
                  className={selectedUserIds.includes(user.id) ? "is-selected" : ""}
                  onClick={() => onOpenUser(user.id)}
                >
                  <td onClick={(event) => event.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedUserIds.includes(user.id)}
                      onChange={() => onToggleSelectUser(user.id)}
                      aria-label={`تحديد ${user.username || user.email}`}
                    />
                  </td>
                  <td>
                    <div className="au-user-cell">
                      <UserAvatar name={user.username || user.email} avatarUrl={user.avatarUrl} />
                      <div>
                        <p className="au-user-cell__name">{user.username || "—"}</p>
                        {user.role === "admin" ? (
                          <span className="au-user-cell__meta">مدير</span>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="au-email" dir="ltr">
                      {user.email || "—"}
                    </span>
                  </td>
                  <td>
                    <p className="au-user-cell__meta">{user.telegram || "—"}</p>
                    <AdminUsersUuidChip value={user.id} />
                  </td>
                  <td>
                    <div className="au-date-cell">
                      <p className="au-date-cell__date">{created.date}</p>
                      {created.time ? <p className="au-date-cell__time">{created.time}</p> : null}
                    </div>
                  </td>
                  <td>
                    <div className="au-date-cell">
                      <p className="au-date-cell__date">{lastSignIn.date}</p>
                      {lastSignIn.time ? <p className="au-date-cell__time">{lastSignIn.time}</p> : null}
                    </div>
                  </td>
                  <td>
                    <div style={{ display: "grid", gap: "0.35rem" }}>
                      <AccountStatusBadge status={user.accountStatus} label={user.accountStatusLabel || user.accountStatus} />
                      <ExpiredSubscriptionBadge user={user} serviceFilter={selectedServiceFilter} />
                    </div>
                  </td>
                  <td>
                    <div style={{ display: "grid", gap: "0.35rem" }}>
                      {user.subscriptionPlan ? (
                        <span className="au-user-cell__meta">{user.subscriptionPlan}</span>
                      ) : null}
                      <SubscriptionStateBadge user={user} serviceFilter={selectedServiceFilter} />
                    </div>
                  </td>
                  <td onClick={(event) => event.stopPropagation()}>
                    <div className="au-toolbar">
                      <button type="button" className="au-btn au-btn--primary" onClick={() => onOpenUser(user.id)}>
                        فتح CRM
                      </button>
                      <button
                        type="button"
                        className="au-btn"
                        onClick={(event) => onOpenQuickPreview(user.id, event)}
                      >
                        معاينة
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
