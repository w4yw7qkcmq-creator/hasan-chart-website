"use client";

export default function PartnerAdminTabs({ tabs, activeTab, onChange }) {
  return (
    <nav className="pa-tabs" aria-label="أقسام مركز إدارة الشركاء">
      <div className="pa-tabs__scroll" role="tablist">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-current={isActive ? "page" : undefined}
              className={`pa-tab ${isActive ? "pa-tab--active" : ""}`}
              onClick={() => onChange(tab.id)}
            >
              <span className="pa-tab__icon" aria-hidden="true">
                {tab.icon}
              </span>
              <span className="pa-tab__label">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
