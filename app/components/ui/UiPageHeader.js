"use client";

import { ui } from "./ui-theme";

export function UiPageHeader({ title, subtitle, actions = null, className = "" }) {
  return (
    <header className={`${ui.pageHeader} flex flex-wrap items-start justify-between gap-3 ${className}`.trim()}>
      <div className="min-w-0">
        {title ? <h1 className={ui.pageHeaderTitle}>{title}</h1> : null}
        {subtitle ? <p className={ui.pageHeaderSubtitle}>{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export default UiPageHeader;
