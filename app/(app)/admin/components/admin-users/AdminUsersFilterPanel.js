"use client";

const STATUS_CHIPS = [
  { id: "all", label: "الكل" },
  { id: "active", label: "نشط" },
  { id: "suspended", label: "معلق" },
  { id: "banned", label: "محظور" },
  { id: "deleted", label: "محذوف" },
];

export default function AdminUsersFilterPanel({
  searchInput,
  onSearchInputChange,
  onClearSearch,
  searching = false,
  clientFilters,
  onClientFiltersChange,
  accountStatusFilter,
  onAccountStatusFilterClick,
  expiredFilterActive,
  onExpiredSubscriptionFilterClick,
  sort,
  order,
  onToggleSort,
  onClearFilters,
  lastLoginFilterAvailable = true,
}) {
  return (
    <section className="au-panel au-filter-panel">
      <div className="au-panel__head au-panel__head--flat">
        <div className="au-panel__lead">
          <span className="au-panel__icon" aria-hidden="true">
            🔎
          </span>
          <div>
            <h2 className="au-panel__title">البحث والفلاتر</h2>
            <p className="au-panel__subtitle">بحث ذكي وفلاتر متقدمة — بدون إعادة تحميل الصفحة.</p>
          </div>
        </div>
        <button type="button" className="au-btn au-btn--compact au-btn--ghost" onClick={onClearFilters}>
          مسح الفلاتر
        </button>
      </div>

      {!lastLoginFilterAvailable ? (
        <p className="au-notice au-notice--warning">
          فلاتر آخر دخول غير متاحة حتى تطبيق migration العمود `profiles.last_sign_in_at` والمزامنة.
        </p>
      ) : null}

      <div className="au-filter-panel__body">
        <div className="au-filter-row au-filter-row--search">
          <label className="au-field au-field--search">
            <span className="au-field__label">بحث ذكي</span>
            <div className="au-search-wrap">
              <span className="au-search-wrap__icon" aria-hidden="true">
                🔍
              </span>
              <input
                className="au-input au-input--lg"
                value={searchInput}
                onChange={(event) => onSearchInputChange(event.target.value)}
                placeholder="الاسم، username، البريد، UUID، Telegram..."
                aria-label="بحث المستخدمين"
              />
              {searchInput ? (
                <button
                  type="button"
                  className="au-btn au-btn--icon au-search-wrap__clear"
                  onClick={onClearSearch}
                  aria-label="مسح البحث"
                >
                  ×
                </button>
              ) : null}
              {searching ? <span className="au-search-wrap__loading" aria-hidden="true">…</span> : null}
            </div>
          </label>
        </div>

        <div className="au-filter-row au-filter-row--3">
          <label className="au-field">
            <span className="au-field__label">الخدمة</span>
            <div className="au-select-wrap">
              <select
                className="au-select"
                value={clientFilters.service}
                onChange={(event) =>
                  onClientFiltersChange({ ...clientFilters, service: event.target.value })
                }
              >
                <option value="all">الكل</option>
                <option value="vip">VIP</option>
                <option value="account_management">إدارة الحسابات</option>
                <option value="alerts">التنبيهات</option>
                <option value="academy">الأكاديمية</option>
              </select>
            </div>
          </label>
          <label className="au-field">
            <span className="au-field__label">الخطة</span>
            <input
              className="au-input"
              value={clientFilters.plan}
              onChange={(event) =>
                onClientFiltersChange({ ...clientFilters, plan: event.target.value })
              }
              placeholder="VIP Spot..."
            />
          </label>
          <label className="au-field">
            <span className="au-field__label">الحالة</span>
            <div className="au-select-wrap">
              <select
                className="au-select"
                value={clientFilters.status}
                onChange={(event) =>
                  onClientFiltersChange({ ...clientFilters, status: event.target.value })
                }
              >
                <option value="all">الكل</option>
                <option value="active">نشط</option>
                <option value="suspended">معلق</option>
                <option value="banned">محظور</option>
                <option value="deleted">محذوف</option>
              </select>
            </div>
          </label>
        </div>

        <div className="au-filter-row au-filter-row--4">
          <label className="au-field">
            <span className="au-field__label">تاريخ التسجيل من</span>
            <input
              type="date"
              className="au-date"
              value={clientFilters.registeredFrom}
              onChange={(event) =>
                onClientFiltersChange({ ...clientFilters, registeredFrom: event.target.value })
              }
            />
          </label>
          <label className="au-field">
            <span className="au-field__label">تاريخ التسجيل إلى</span>
            <input
              type="date"
              className="au-date"
              value={clientFilters.registeredTo}
              onChange={(event) =>
                onClientFiltersChange({ ...clientFilters, registeredTo: event.target.value })
              }
            />
          </label>
          <label className="au-field">
            <span className="au-field__label">آخر دخول من</span>
            <input
              type="date"
              className="au-date"
              value={clientFilters.lastLoginFrom}
              disabled={!lastLoginFilterAvailable}
              onChange={(event) =>
                onClientFiltersChange({ ...clientFilters, lastLoginFrom: event.target.value })
              }
            />
          </label>
          <label className="au-field">
            <span className="au-field__label">آخر دخول إلى</span>
            <input
              type="date"
              className="au-date"
              value={clientFilters.lastLoginTo}
              disabled={!lastLoginFilterAvailable}
              onChange={(event) =>
                onClientFiltersChange({ ...clientFilters, lastLoginTo: event.target.value })
              }
            />
          </label>
        </div>

        <div className="au-filter-row au-filter-row--toolbar">
          <div className="au-chip-row">
            {STATUS_CHIPS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`au-chip ${
                  !expiredFilterActive && accountStatusFilter === item.id ? "is-active" : ""
                }`}
                onClick={() => onAccountStatusFilterClick(item.id)}
              >
                {item.label}
              </button>
            ))}
            <button
              type="button"
              className={`au-chip ${expiredFilterActive ? "is-active" : ""}`}
              onClick={onExpiredSubscriptionFilterClick}
            >
              الاشتراكات المنتهية
            </button>
          </div>
          <div className="au-chip-row">
            <button
              type="button"
              className={`au-chip ${sort === "created_at" ? "is-active" : ""}`}
              onClick={() => onToggleSort("created_at")}
            >
              {sort === "created_at"
                ? order === "desc"
                  ? "الأحدث تسجيلًا ↓"
                  : "الأقدم تسجيلًا ↑"
                : "ترتيب: تاريخ التسجيل"}
            </button>
            <button
              type="button"
              className={`au-chip ${sort === "last_sign_in" ? "is-active" : ""}`}
              onClick={() => onToggleSort("last_sign_in")}
              disabled={!lastLoginFilterAvailable}
            >
              {sort === "last_sign_in"
                ? order === "desc"
                  ? "آخر دخول: الأحدث ↓"
                  : "آخر دخول: الأقدم ↑"
                : "ترتيب: آخر دخول"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
