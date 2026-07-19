"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import SuccessModal from "../../components/SuccessModal";
import { useRequireAuth } from "../../hooks/useRequireAuth";

const PublicServiceLanding = dynamic(
  () =>
    import("../../components/public-seo/PublicServiceLanding").then(
      (mod) => mod.default
    ),
  { ssr: false }
);

function AccountManagementAuthenticated() {
  const [spot, setSpot] = useState({
    telegram: "",
    capital: "",
    apiKey: "",
    secretKey: "",
    file: null,
  });

  const [futures, setFutures] = useState({
    telegram: "",
    capital: "",
    apiKey: "",
    secretKey: "",
    file: null,
  });

  const [forex, setForex] = useState({
    telegram: "",
    account: "",
    password: "",
    server: "",
    file: null,
  });

  const [submitting, setSubmitting] = useState(false);
  const [nextAllowedAt, setNextAllowedAt] = useState(null);
  const [remainingTime, setRemainingTime] = useState("");

  const [successModal, setSuccessModal] = useState({
    open: false,
    type: "success",
    title: "تم إرسال الطلب بنجاح",
    message: "تم إرسال طلب إدارة الحساب إلى فريق الإدارة وسيتم التواصل معك قريباً.",
  });

  const allowedImageTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
  const maxImageSize = 15 * 1024 * 1024;

  const formatFileSize = (bytes) => {
    if (!bytes) return "0MB";
    return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
  };

  const validateImageFile = (file) => {
    if (!file) return { valid: true };

    const blockedExtensions = /\.(js|jsx|html|svg|exe|php|sh|bat|cmd)$/i;

    if (blockedExtensions.test(file.name || "")) {
      return {
        valid: false,
        message: "نوع الملف غير مسموح.",
      };
    }

    if (!allowedImageTypes.includes(file.type)) {
      return {
        valid: false,
        message: "يسمح فقط برفع صور JPG أو PNG أو WEBP.",
      };
    }

    if (file.size > maxImageSize) {
      return {
        valid: false,
        message: "الحد الأقصى لحجم الصورة هو 15MB.",
      };
    }

    return { valid: true };
  };

  const handleFileChange = (section, setSection, file) => {
    const validation = validateImageFile(file);

    if (!validation.valid) {
      setSuccessModal({
        open: true,
        type: "error",
        title: "ملف غير مسموح",
        message: validation.message,
      });
      setSection({ ...section, file: null });
      return;
    }

    setSection({ ...section, file });
  };

  useEffect(() => {
    if (!nextAllowedAt) return;

    const updateTimer = () => {
      const diff = new Date(nextAllowedAt).getTime() - Date.now();

      if (diff <= 0) {
        setRemainingTime("");
        setNextAllowedAt(null);
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

      setRemainingTime(`${hours} ساعة و ${minutes} دقيقة`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 60000);

    return () => clearInterval(interval);
  }, [nextAllowedAt]);

  const saveRequest = async (type, data) => {
    const fileValidation = validateImageFile(data.file);

    if (!fileValidation.valid) {
      setSuccessModal({
        open: true,
        type: "error",
        title: "ملف غير مسموح",
        message: fileValidation.message,
      });
      return false;
    }

    setSubmitting(true);

    try {
      const response = await fetch("/api/account-management", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          platform: type,
          accountType: type,
          capital: data.capital || data.account || "غير محدد",
          contactMethod: data.telegram,
          notes: data.server ? `Server: ${data.server}` : null,
          apiKey: data.apiKey,
          secretKey: data.secretKey,
          tradingPassword: data.password,
          screenshotFileName: data.file?.name || null,
          screenshotMimeType: data.file?.type || null,
          screenshotSize: data.file?.size || 0,
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (result?.nextAllowedAt) {
        setNextAllowedAt(result.nextAllowedAt);
      }

      if (!response.ok) {
        setSuccessModal({
          open: true,
          type: "error",
          title: "تعذر إرسال الطلب",
          message: result.error || "حدث خطأ أثناء إرسال الطلب، يرجى المحاولة مرة أخرى.",
        });
        return false;
      }

      setSuccessModal({
        open: true,
        type: "success",
        title: "تم إرسال الطلب بنجاح",
        message: "تم إرسال طلب إدارة الحساب إلى فريق الإدارة وسيتم التواصل معك قريباً.",
      });

      return true;
    } catch (error) {
      setSuccessModal({
        open: true,
        type: "error",
        title: "تعذر إرسال الطلب",
        message: "حدث خطأ غير متوقع، يرجى المحاولة مرة أخرى.",
      });
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const handleSpotSubmit = async (e) => {
    e.preventDefault();
    const ok = await saveRequest("إدارة حساب سبوت", spot);
    if (ok) setSpot({ telegram: "", capital: "", apiKey: "", secretKey: "", file: null });
  };

  const handleFuturesSubmit = async (e) => {
    e.preventDefault();
    const ok = await saveRequest("إدارة حساب فيوتشر", futures);
    if (ok) setFutures({ telegram: "", capital: "", apiKey: "", secretKey: "", file: null });
  };

  const handleForexSubmit = async (e) => {
    e.preventDefault();
    const ok = await saveRequest("إدارة حساب فوركس", forex);
    if (ok) setForex({ telegram: "", account: "", password: "", server: "", file: null });
  };

  return (
    <main className="min-h-screen bg-[#020617] text-white py-12 px-4">
      <SuccessModal
        open={successModal.open}
        type={successModal.type}
        title={successModal.title}
        message={successModal.message}
        onClose={() => setSuccessModal((current) => ({ ...current, open: false }))}
      />
      <div className="max-w-5xl mx-auto space-y-10">
        <div className="space-y-3">
          <h1 className="text-3xl font-bold">إدارة الحسابات</h1>

          {remainingTime && (
            <div className="rounded-2xl border border-blue-400/30 bg-blue-500/10 px-4 py-3 text-center text-sm font-bold text-white">
              يمكنك تقديم طلب إدارة حساب جديد بعد: {remainingTime}
            </div>
          )}
        </div>

        <form onSubmit={handleSpotSubmit} className="box space-y-6">
          <h2 className="text-2xl font-bold">إدارة حساب سبوت</h2>

          <div className="grid md:grid-cols-2 gap-4">
            <input
              placeholder="يوزر حسابك على التليجرام"
              value={spot.telegram}
              onChange={(e) => setSpot({ ...spot, telegram: e.target.value })}
              className="input"
              required
            />

            <input
              type="number"
              placeholder="رأس المال بالدولار"
              value={spot.capital}
              onChange={(e) => setSpot({ ...spot, capital: e.target.value })}
              className="input"
              required
            />

            <input
              placeholder="API Key"
              value={spot.apiKey}
              onChange={(e) => setSpot({ ...spot, apiKey: e.target.value })}
              className="input"
              required
            />

            <input
              placeholder="Secret Key"
              value={spot.secretKey}
              onChange={(e) => setSpot({ ...spot, secretKey: e.target.value })}
              className="input"
              required
            />

            <div className="flex flex-col md:col-span-2">
              <label className="mb-2 text-slate-300">أرفق صورة لرأس مالك</label>
              <input
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp"
                onChange={(e) => handleFileChange(spot, setSpot, e.target.files[0])}
                className="p-4 rounded-2xl bg-[#111827] border border-white/10 text-white"
              />
              {spot.file && (
                <p className="mt-2 text-sm font-bold text-emerald-300">
                  تم اختيار: {spot.file.name} ({formatFileSize(spot.file.size)})
                </p>
              )}
            </div>
          </div>

          <button type="submit" className="blueBtn" disabled={submitting}>
            {submitting ? "جاري الإرسال..." : "إرسال طلب السبوت"}
          </button>
        </form>

        <form onSubmit={handleFuturesSubmit} className="box space-y-6">
          <h2 className="text-2xl font-bold">إدارة حساب فيوتشر</h2>

          <div className="grid md:grid-cols-2 gap-4">
            <input
              placeholder="يوزر حسابك على التليجرام"
              value={futures.telegram}
              onChange={(e) => setFutures({ ...futures, telegram: e.target.value })}
              className="input"
              required
            />

            <input
              type="number"
              placeholder="رأس المال بالدولار"
              value={futures.capital}
              onChange={(e) => setFutures({ ...futures, capital: e.target.value })}
              className="input"
              required
            />

            <input
              placeholder="API Key"
              value={futures.apiKey}
              onChange={(e) => setFutures({ ...futures, apiKey: e.target.value })}
              className="input"
              required
            />

            <input
              placeholder="Secret Key"
              value={futures.secretKey}
              onChange={(e) => setFutures({ ...futures, secretKey: e.target.value })}
              className="input"
              required
            />

            <div className="flex flex-col md:col-span-2">
              <label className="mb-2 text-slate-300">أرفق صورة لرأس مالك</label>
              <input
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp"
                onChange={(e) => handleFileChange(futures, setFutures, e.target.files[0])}
                className="p-4 rounded-2xl bg-[#111827] border border-white/10 text-white"
              />
              {futures.file && (
                <p className="mt-2 text-sm font-bold text-emerald-300">
                  تم اختيار: {futures.file.name} ({formatFileSize(futures.file.size)})
                </p>
              )}
            </div>
          </div>

          <button type="submit" className="blueBtn" disabled={submitting}>
            {submitting ? "جاري الإرسال..." : "إرسال طلب الفيوتشر"}
          </button>
        </form>

        <form onSubmit={handleForexSubmit} className="box space-y-6">
          <h2 className="text-2xl font-bold">إدارة حساب فوركس</h2>

          <div className="grid md:grid-cols-2 gap-4">
            <input
              placeholder="يوزر حسابك على التليجرام"
              value={forex.telegram}
              onChange={(e) => setForex({ ...forex, telegram: e.target.value })}
              className="input"
              required
            />

            <input
              placeholder="رقم الحساب"
              value={forex.account}
              onChange={(e) => setForex({ ...forex, account: e.target.value })}
              className="input"
              required
            />

            <input
              type="password"
              placeholder="كلمة مرور حساب الميتاتريدر"
              value={forex.password}
              onChange={(e) => setForex({ ...forex, password: e.target.value })}
              className="input"
              required
            />

            <input
              placeholder="اسم الخادم Server"
              value={forex.server}
              onChange={(e) => setForex({ ...forex, server: e.target.value })}
              className="input"
              required
            />

            <div className="flex flex-col md:col-span-2">
              <label className="mb-2 text-slate-300">أرفق صورة توضح قيمة الحساب</label>
              <input
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp"
                onChange={(e) => handleFileChange(forex, setForex, e.target.files[0])}
                className="p-4 rounded-2xl bg-[#111827] border border-white/10 text-white"
              />
              {forex.file && (
                <p className="mt-2 text-sm font-bold text-emerald-300">
                  تم اختيار: {forex.file.name} ({formatFileSize(forex.file.size)})
                </p>
              )}
            </div>
          </div>

          <button type="submit" className="blueBtn" disabled={submitting}>
            {submitting ? "جاري الإرسال..." : "إرسال طلب الفوركس"}
          </button>
        </form>
      </div>
    </main>
  );
}

export default function AccountManagement() {
  const { sessionPending, isAuthenticated, shouldShowLogin } = useRequireAuth();

  if (sessionPending) {
    return (
      <main className="flex min-h-[50vh] items-center justify-center bg-[#020617] text-white">
        <p className="font-black text-cyan-200">جاري التحقق من الجلسة...</p>
      </main>
    );
  }

  if (shouldShowLogin || !isAuthenticated) {
    return <PublicServiceLanding pageKey="account-management" />;
  }

  return <AccountManagementAuthenticated />;
}