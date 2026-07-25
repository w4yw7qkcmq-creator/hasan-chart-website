"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppModal from "../../components/AppModal";
import Breadcrumbs from "../../components/seo/Breadcrumbs";
import {
  SUBSCRIPTIONS_HUB_LINKS,
  SUBSCRIPTION_PLANS,
  formatSubscriptionDate,
  getRemainingDays,
} from "./subscriptionsHelpers";

const PAGE_BREADCRUMBS = [
  { label: "الرئيسية", href: "/" },
  { label: "الاشتراكات", href: "/subscriptions" },
];

function PlanFeature({ text }) {
  return (
    <div className="subscriptions-plan-feature">
      <span className="subscriptions-plan-feature__icon" aria-hidden="true">
        ✓
      </span>
      <span>{text}</span>
    </div>
  );
}

function HubLinks() {
  return (
    <nav className="subscriptions-hub" aria-label="روابط مفيدة">
      <h2 className="subscriptions-hub__title">خدمات مرتبطة</h2>
      <div className="subscriptions-hub__grid">
        {SUBSCRIPTIONS_HUB_LINKS.map((link) => (
          <Link key={link.href} href={link.href} className="subscriptions-hub__link">
            {link.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

export default function SubscriptionsAuthenticated({ user }) {
  const [loadingPlan, setLoadingPlan] = useState(null);
  const [notification, setNotification] = useState(null);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [telegramUsername, setTelegramUsername] = useState("");
  const [paymentProofFile, setPaymentProofFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [currentSubscription, setCurrentSubscription] = useState(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(true);

  useEffect(() => {
    if (!notification) return;

    const timer = setTimeout(() => {
      setNotification(null);
    }, 5000);

    return () => clearTimeout(timer);
  }, [notification]);

  useEffect(() => {
    if (!user?.email) {
      setCurrentSubscription(null);
      setSubscriptionLoading(false);
      return;
    }

    const loadCurrentSubscription = async () => {
      try {
        const response = await fetch("/api/my-subscription-status", {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        });

        const result = await response.json().catch(() => null);

        if (!response.ok || !result?.success || !result?.active) {
          setCurrentSubscription(null);
          return;
        }

        setCurrentSubscription(result.current_subscription || result.plans?.[0] || null);
      } catch {
        setCurrentSubscription(null);
      } finally {
        setSubscriptionLoading(false);
      }
    };

    void loadCurrentSubscription();
  }, [user?.email]);

  const handlePaymentProof = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    const maxBytes = 8 * 1024 * 1024;

    if (!allowedTypes.includes(String(file.type || "").toLowerCase())) {
      setNotification({
        type: "error",
        title: "ملف غير مدعوم",
        message: "يرجى رفع صورة JPG أو PNG أو WEBP فقط.",
      });
      return;
    }

    if (file.size > maxBytes) {
      setNotification({
        type: "error",
        title: "حجم الملف كبير",
        message: "الحد الأقصى لحجم إثبات الدفع هو 8MB.",
      });
      return;
    }

    setPaymentProofFile(file);
    event.target.value = "";
  };

  const requestSubscription = (plan) => {
    setSelectedPlan(plan);
    setTelegramUsername("");
    setPaymentProofFile(null);
  };

  const submitSubscriptionRequest = async () => {
    if (!selectedPlan || !user?.email || submitting) return;

    const cleanTelegramUsername = telegramUsername.trim();

    if (!cleanTelegramUsername) {
      setNotification({
        type: "error",
        title: "أدخل يوزر التليجرام",
        message: "يرجى كتابة يوزر التليجرام حتى يستطيع الدعم التواصل معك.",
      });
      return;
    }

    if (!paymentProofFile) {
      setNotification({
        type: "error",
        title: "أرفق إشعار الدفع",
        message: "يرجى رفع صورة إثبات الدفع قبل إرسال الطلب.",
      });
      return;
    }

    setSubmitting(true);
    setLoadingPlan(selectedPlan.name);
    const abortController = new AbortController();

    try {
      const initResponse = await fetch("/api/subscription-request/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        signal: abortController.signal,
        body: JSON.stringify({
          username: user.username || user.email,
          plan_name: selectedPlan.name,
          category: selectedPlan.category,
          price: selectedPlan.price,
          telegram_username: cleanTelegramUsername,
        }),
      });
      const initResult = await initResponse.json().catch(() => null);
      if (!initResponse.ok || !initResult?.success) {
        throw new Error(initResult?.error || "تعذر بدء طلب الاشتراك");
      }

      const sessionId = initResult.sessionId;
      const authorizeResponse = await fetch("/api/subscription-request/upload-authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        signal: abortController.signal,
        body: JSON.stringify({
          sessionId,
          mimeType: paymentProofFile.type,
          sizeBytes: paymentProofFile.size,
        }),
      });
      const authorizeResult = await authorizeResponse.json().catch(() => null);
      if (!authorizeResponse.ok || !authorizeResult?.success) {
        throw new Error(authorizeResult?.error || "تعذر إعداد رفع إثبات الدفع");
      }

      const uploadResponse = await fetch(authorizeResult.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": paymentProofFile.type },
        body: paymentProofFile,
        signal: abortController.signal,
      });
      if (!uploadResponse.ok) {
        throw new Error("تعذر رفع ملف إثبات الدفع إلى التخزين الآمن");
      }

      const finalizeResponse = await fetch("/api/subscription-request/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        signal: abortController.signal,
        body: JSON.stringify({
          sessionId,
          objectPath: authorizeResult.objectPath,
          mimeType: paymentProofFile.type,
        }),
      });
      const finalizeResult = await finalizeResponse.json().catch(() => null);
      if (!finalizeResponse.ok || !finalizeResult?.success) {
        if (finalizeResult?.errorCode === "UPLOAD_SESSION_EXPIRED") {
          throw new Error("انتهت صلاحية جلسة الرفع قبل إتمام الطلب.");
        }
        if (finalizeResult?.errorCode === "MIME_MISMATCH" || finalizeResult?.errorCode === "INVALID_UPLOAD_MIME") {
          throw new Error("صيغة إثبات الدفع غير مدعومة أو لا تطابق محتوى الملف.");
        }
        throw new Error(finalizeResult?.error || "تعذr إتمام طلب الاشتراك");
      }

      setSelectedPlan(null);
      setTelegramUsername("");
      setPaymentProofFile(null);

      setNotification({
        type: "success",
        title: "طلبك قيد المعالجة ✅",
        message: "تم استلام طلب الاشتراك وإثبات الدفع، وسيقوم الدعم بمراجعته وتفعيل الباقة.",
      });
    } catch (error) {
      if (error?.name === "AbortError") return;
      setNotification({
        type: "error",
        title: "حدث خطأ أثناء إرسال الطلب",
        message: error?.message || "حاول مرة ثانية بعد قليل.",
      });
    } finally {
      setSubmitting(false);
      setLoadingPlan(null);
    }
  };

  return (
    <main className="subscriptions-page">
      <div className="subscriptions-page__bg" aria-hidden="true" />

      {notification && (
        <AppModal
          open={Boolean(notification)}
          type={
            notification.type === "success"
              ? "success"
              : notification.type === "warning"
                ? "warning"
                : "error"
          }
          title={notification.title}
          message={notification.message}
          onClose={() => setNotification(null)}
        />
      )}

      {notification ? (
        <div
          className={`subscriptions-toast subscriptions-toast--${notification.type}`}
          role="status"
        >
          <strong>{notification.title}</strong>
          <p>{notification.message}</p>
        </div>
      ) : null}

      {selectedPlan && (
        <div className="subscriptions-modal-overlay">
          <div className="subscriptions-modal">
            <div className="subscriptions-modal__head">
              <div>
                <p className="subscriptions-modal__eyebrow">طلب اشتراك جديد</p>
                <h3 className="subscriptions-modal__title">إتمام طلب الاشتراك</h3>
                <p className="subscriptions-modal__text">
                  أرسل بيانات الدفع ليتمكن الدعم من مراجعة الطلب وتفعيل الباقة.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setSelectedPlan(null);
                  setTelegramUsername("");
                  setPaymentProofFile(null);
                }}
                className="subscriptions-modal__close"
                aria-label="إغلاق"
              >
                ×
              </button>
            </div>

            <div className="subscriptions-modal__body">
              <div className="subscriptions-modal__plan">
                <p className="subscriptions-modal__plan-label">الباقة المختارة</p>
                <div className="subscriptions-modal__plan-row">
                  <span>{selectedPlan.name}</span>
                  <span>{selectedPlan.price}</span>
                </div>
              </div>

              <label className="subscriptions-field">
                <span>يوزر التليجرام</span>
                <input
                  value={telegramUsername}
                  onChange={(event) => setTelegramUsername(event.target.value)}
                  placeholder="مثال: @username"
                  className="subscriptions-input"
                />
              </label>

              <label className="subscriptions-field">
                <span>صورة إشعار الدفع</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePaymentProof}
                  className="subscriptions-file"
                />
                {paymentProofFile ? (
                  <div className="subscriptions-proof-ok">تم إرفاق صورة إثبات الدفع ✅</div>
                ) : null}
              </label>
            </div>

            <div className="subscriptions-modal__actions">
              <button
                type="button"
                onClick={submitSubscriptionRequest}
                disabled={loadingPlan === selectedPlan.name || submitting}
                className="subscriptions-btn subscriptions-btn--primary"
              >
                {loadingPlan === selectedPlan.name ? "جاري إرسال الطلب..." : "إرسال الطلب للمراجعة"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedPlan(null);
                  setTelegramUsername("");
                  setPaymentProofFile(null);
                }}
                className="subscriptions-btn subscriptions-btn--secondary"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="subscriptions-page__inner">
        <div className="subscriptions-breadcrumb">
          <Breadcrumbs items={PAGE_BREADCRUMBS} variant="dark" />
        </div>

        <header className="subscriptions-hero">
          <span className="subscriptions-hero__eyebrow">PREMIUM MEMBERSHIPS</span>
          <h1 className="subscriptions-hero__title">اشتراكات التوصيات Spot & Futures</h1>
          <p className="subscriptions-hero__text">
            اختر باقة السبوت أو الفيوتشر المناسبة لأسلوب تداولك، مع توصيات واضحة ومتابعة
            احترافية من فريق HasaN CharT World.
          </p>
        </header>

        <section className="subscriptions-status-card" aria-label="اشتراكك الحالي">
          <div className="subscriptions-status-card__head">
            <div>
              <span className="subscriptions-status-card__eyebrow">CURRENT MEMBERSHIP</span>
              <h2 className="subscriptions-status-card__title">اشتراكك الحالي</h2>
              <p className="subscriptions-status-card__text">
                تابع حالة باقتك وتاريخ البداية والانتهاء وعدد الأيام المتبقية.
              </p>
            </div>

            {currentSubscription ? (
              <Link href="#plans" className="subscriptions-btn subscriptions-btn--primary">
                تجديد الاشتراك
              </Link>
            ) : null}
          </div>

          {subscriptionLoading ? (
            <div className="subscriptions-status-loading" role="status">
              جاري تحميل بيانات الاشتراك…
            </div>
          ) : currentSubscription ? (
            <div className="subscriptions-status-grid">
              <div className="subscriptions-status-item">
                <p>اسم الباقة</p>
                <strong>
                  {currentSubscription.plan_name || currentSubscription.category || "اشتراك VIP"}
                </strong>
              </div>
              <div className="subscriptions-status-item">
                <p>تاريخ البداية</p>
                <strong>
                  {formatSubscriptionDate(
                    currentSubscription.started_at || currentSubscription.created_at
                  )}
                </strong>
              </div>
              <div className="subscriptions-status-item">
                <p>تاريخ الانتهاء</p>
                <strong>{formatSubscriptionDate(currentSubscription.expires_at)}</strong>
              </div>
              <div className="subscriptions-status-item subscriptions-status-item--highlight">
                <p>الأيام المتبقية</p>
                <strong>{getRemainingDays(currentSubscription.expires_at) ?? "--"}</strong>
                <span>يوم</span>
              </div>
            </div>
          ) : (
            <div className="subscriptions-status-empty">
              <p className="subscriptions-status-empty__title">لا يوجد اشتراك مفعل حالياً</p>
              <p className="subscriptions-status-empty__text">
                اختر إحدى الباقات بالأسفل وأرسل طلب الاشتراك للمراجعة.
              </p>
            </div>
          )}
        </section>

        <HubLinks />

        <section id="plans" className="subscriptions-plans">
          {["باقات السبوت", "باقات الفيوتشر"].map((category) => (
            <div key={category} className="subscriptions-plans-group">
              <div className="subscriptions-plans-group__head">
                <div>
                  <h2>{category}</h2>
                  <p>
                    {category === "باقات السبوت"
                      ? "اشتراكات توصيات السبوت للفترات الشهرية والربع سنوية والسنوية."
                      : "اشتراكات توصيات الفيوتشر مع متابعة وإدارة مخاطر حسب مدة الباقة."}
                  </p>
                </div>
                <span className="subscriptions-plans-group__badge">
                  {category === "باقات السبوت" ? "SPOT" : "FUTURES"}
                </span>
              </div>

              <div className="subscriptions-plans-grid">
                {SUBSCRIPTION_PLANS.filter((plan) => plan.category === category).map((plan) => (
                  <article
                    key={plan.name}
                    className={`subscriptions-plan-card ${
                      plan.featured ? "subscriptions-plan-card--featured" : ""
                    }`}
                  >
                    <div className="subscriptions-plan-card__head">
                      <div>
                        <span className="subscriptions-plan-card__badge">{plan.badge}</span>
                        <h3>{plan.name}</h3>
                      </div>
                      <span className="subscriptions-plan-card__icon" aria-hidden="true">
                        {plan.icon}
                      </span>
                    </div>

                    <div className="subscriptions-plan-card__price">
                      <span>{plan.price}</span>
                      <small>{plan.period}</small>
                    </div>

                    <div className="subscriptions-plan-card__features">
                      {plan.features.map((feature) => (
                        <PlanFeature key={feature} text={feature} />
                      ))}
                    </div>

                    <div className="subscriptions-plan-card__actions">
                      <button
                        type="button"
                        onClick={() => requestSubscription(plan)}
                        disabled={loadingPlan === plan.name}
                        className="subscriptions-btn subscriptions-btn--primary subscriptions-btn--block"
                      >
                        {loadingPlan === plan.name ? "جاري إرسال الطلب..." : "اشترك الآن"}
                      </button>

                      <Link
                        href="https://t.me/HasaNCharTSupport"
                        className="subscriptions-btn subscriptions-btn--secondary subscriptions-btn--block"
                      >
                        التواصل مع الدعم
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </section>

        <section className="subscriptions-support">
          <div>
            <span className="subscriptions-support__eyebrow">SUPPORT & CONSULTING</span>
            <h2>تحتاج خطة خاصة أو استشارة؟</h2>
            <p>
              تواصل مع فريق HasaN CharT للحصول على اشتراك مخصص، إدارة حسابات، أو خدمات
              تداول خاصة.
            </p>
          </div>

          <div className="subscriptions-support__actions">
            <Link
              href="https://t.me/HasaNCharTSupport"
              className="subscriptions-btn subscriptions-btn--primary"
            >
              الدعم الفني
            </Link>
            <Link
              href="https://t.me/CEOHasaNCharT"
              className="subscriptions-btn subscriptions-btn--secondary"
            >
              التواصل مع دكتور حسن
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
