"use client";
export default function SubscriptionRequestTimeline({
  timeline = [],
  summary = null,
  sparse = false,
}) {
  const events = Array.isArray(timeline) ? timeline : [];
  const summaryData = summary || {
    totalEvents: events.length,
    lastUpdateLabel: "—",
    lastAdminEmail: "—",
    hasAdminHistory: false,
  };
  return (
    <section className="admin-subscription-timeline" aria-label="سجل الطلب">
      {" "}
      <header className="admin-subscription-timeline__summary">
        {" "}
        <div className="admin-subscription-timeline__summary-item">
          {" "}
          <span className="admin-subscription-timeline__summary-label">
            إجمالي الأحداث
          </span>{" "}
          <strong className="admin-subscription-timeline__summary-value">
            {" "}
            {summaryData.totalEvents}{" "}
          </strong>{" "}
        </div>{" "}
        <div className="admin-subscription-timeline__summary-item">
          {" "}
          <span className="admin-subscription-timeline__summary-label">
            آخر تحديث
          </span>{" "}
          <strong className="admin-subscription-timeline__summary-value">
            {" "}
            {summaryData.lastUpdateLabel}{" "}
          </strong>{" "}
        </div>{" "}
        <div className="admin-subscription-timeline__summary-item">
          {" "}
          <span className="admin-subscription-timeline__summary-label">
            آخر إداري
          </span>{" "}
          <strong className="admin-subscription-timeline__summary-value break-all">
            {" "}
            {summaryData.lastAdminEmail}{" "}
          </strong>{" "}
        </div>{" "}
      </header>{" "}
      {sparse ? (
        <article className="admin-subscription-timeline__empty">
          {" "}
          <span
            className="admin-subscription-timeline__empty-icon"
            aria-hidden="true"
          >
            {" "}
            🕘{" "}
          </span>{" "}
          <p className="admin-subscription-timeline__empty-title">
            {" "}
            لا يوجد سجل إضافي لهذا الطلب حتى الآن.{" "}
          </p>{" "}
          <p className="admin-subscription-timeline__empty-text">
            {" "}
            سيظهر هنا أي تحديث إداري على الطلب فور تنفيذه.{" "}
          </p>{" "}
        </article>
      ) : (
        <ol className="admin-subscription-timeline__list">
          {" "}
          {events.map((event, index) => (
            <li
              key={event.id}
              className={`admin-subscription-timeline__item admin-subscription-timeline__item--${event.color}`}
            >
              {" "}
              <div
                className="admin-subscription-timeline__marker"
                aria-hidden="true"
              >
                {" "}
                <span className="admin-subscription-timeline__dot" />{" "}
                {index < events.length - 1 ? (
                  <span className="admin-subscription-timeline__line" />
                ) : null}{" "}
              </div>{" "}
              <div className="admin-subscription-timeline__content">
                {" "}
                <div className="admin-subscription-timeline__head">
                  {" "}
                  <span
                    className="admin-subscription-timeline__icon"
                    aria-hidden="true"
                  >
                    {" "}
                    {event.icon}{" "}
                  </span>{" "}
                  <h4 className="admin-subscription-timeline__title">
                    {event.title}
                  </h4>{" "}
                </div>{" "}
                {event.description ? (
                  <p className="admin-subscription-timeline__description">
                    {event.description}
                  </p>
                ) : null}{" "}
                <div className="admin-subscription-timeline__meta">
                  {" "}
                  <time dateTime={event.occurredAt || undefined}>
                    {" "}
                    {event.occurredAtLabel}{" "}
                  </time>{" "}
                  {event.adminEmail &&
                  event.type !== "created" &&
                  event.type !== "payment_proof" ? (
                    <span className="admin-subscription-timeline__admin">
                      {event.adminEmail}
                    </span>
                  ) : null}{" "}
                </div>{" "}
              </div>{" "}
            </li>
          ))}{" "}
        </ol>
      )}{" "}
    </section>
  );
}
