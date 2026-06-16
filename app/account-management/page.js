"use client";
import { useState } from "react";
import SuccessModal from "../components/SuccessModal";

export default function AccountManagement() {
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
  const [successModal, setSuccessModal] = useState({
    open: false,
    title: "تم إرسال الطلب بنجاح",
    message: "تم إرسال طلب إدارة الحساب إلى فريق الإدارة وسيتم التواصل معك قريباً.",
  });

  const saveRequest = async (type, data) => {
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
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        setSuccessModal({
          open: true,
          title: "تعذر إرسال الطلب",
          message: result.error || "حدث خطأ أثناء إرسال الطلب، يرجى المحاولة مرة أخرى.",
        });
        return false;
      }

      setSuccessModal({
        open: true,
        title: "تم إرسال الطلب بنجاح",
        message: "تم إرسال طلب إدارة الحساب إلى فريق الإدارة وسيتم التواصل معك قريباً.",
      });

      return true;
    } catch (error) {
      setSuccessModal({
        open: true,
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
        title={successModal.title}
        message={successModal.message}
        onClose={() => setSuccessModal((current) => ({ ...current, open: false }))}
      />
      <div className="max-w-5xl mx-auto space-y-10">
        <h1 className="text-3xl font-bold">إدارة الحسابات</h1>

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
                accept="image/*"
                onChange={(e) => setSpot({ ...spot, file: e.target.files[0] })}
                className="p-4 rounded-2xl bg-[#111827] border border-white/10 text-white"
              />
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
                accept="image/*"
                onChange={(e) => setFutures({ ...futures, file: e.target.files[0] })}
                className="p-4 rounded-2xl bg-[#111827] border border-white/10 text-white"
              />
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
                accept="image/*"
                onChange={(e) => setForex({ ...forex, file: e.target.files[0] })}
                className="p-4 rounded-2xl bg-[#111827] border border-white/10 text-white"
              />
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