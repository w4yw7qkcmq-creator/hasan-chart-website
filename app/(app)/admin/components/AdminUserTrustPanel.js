"use client";

import { useEffect, useState } from "react";
import { adminFetch } from "../../../../lib/admin-fetch";
import {
  humanVerificationLabelAr,
  partnerRewardEligibilityLabelAr,
} from "../../../../lib/security/human-verification.js";
import { getUserClassificationLabel } from "../../../../lib/user-classification";
import { fraudSignalLabelAr } from "../../../../lib/security/fraud-signal-labels.js";

export default function AdminUserTrustPanel({ userId }) {
  const [trust, setTrust] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const res = await adminFetch(`/api/admin/user-management/${userId}/trust`);
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body?.success) {
          throw new Error(body?.error || "trust_load_failed");
        }
        if (!cancelled) setTrust(body.trust);
      } catch (err) {
        if (!cancelled) setError(err?.message || "trust_load_failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (userId) load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (loading) {
    return <div className="admin-user-trust-panel admin-user-trust-panel--loading">جاري تحميل بيانات الثقة...</div>;
  }

  if (error) {
    return <div className="admin-user-trust-panel admin-user-trust-panel--error">{error}</div>;
  }

  if (!trust) {
    return <div className="admin-user-trust-panel">لا توجد بيانات ثقة.</div>;
  }

  return (
    <div className="admin-user-trust-panel">
      <div className="admin-user-trust-grid">
        <article className="admin-user-trust-card">
          <h4>التصنيف الفعّال</h4>
          <p>{getUserClassificationLabel(trust.classification)}</p>
        </article>
        <article className="admin-user-trust-card">
          <h4>التصنيف المخزّن</h4>
          <p>{trust.storedClassification ? getUserClassificationLabel(trust.storedClassification) : "—"}</p>
        </article>
        <article className="admin-user-trust-card">
          <h4>مصدر التصنيف</h4>
          <p>{trust.classificationSource || "—"}</p>
        </article>
        <article className="admin-user-trust-card">
          <h4>التحقق البشري</h4>
          <p>{humanVerificationLabelAr(trust.humanVerification)}</p>
        </article>
        <article className="admin-user-trust-card">
          <h4>البريد</h4>
          <p>{trust.emailVerified ? "مؤكد" : "غير مؤكد"}</p>
        </article>
        <article className="admin-user-trust-card">
          <h4>أهلية مكافآت الشركاء</h4>
          <p>{partnerRewardEligibilityLabelAr(trust.partnerRewardEligibility)}</p>
        </article>
        <article className="admin-user-trust-card">
          <h4>مستوى المخاطر</h4>
          <p>{trust.riskLevel || "—"}</p>
        </article>
        <article className="admin-user-trust-card">
          <h4>حسابات على الجهاز</h4>
          <p>{trust.deviceAccountsCount ?? 0}</p>
        </article>
        <article className="admin-user-trust-card">
          <h4>حسابات على الشبكة</h4>
          <p>{trust.networkAccountsCount ?? 0}</p>
        </article>
        <article className="admin-user-trust-card">
          <h4>آخر تقييم</h4>
          <p>{trust.lastAssessmentAt ? new Date(trust.lastAssessmentAt).toLocaleString("ar") : "—"}</p>
        </article>
      </div>
      {Array.isArray(trust.signals) && trust.signals.length > 0 ? (
        <div className="admin-user-trust-signals">
          <h4>إشارات المخاطرة</h4>
          <ul>
            {trust.signals.map((signal) => (
              <li key={`${signal.type}-${signal.lastSeenAt}`}>
                {fraudSignalLabelAr(signal.type)} — {signal.occurrences} — {new Date(signal.lastSeenAt).toLocaleString("ar")}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
