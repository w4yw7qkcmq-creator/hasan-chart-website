"use client";

import "../login/login-experience.css";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../components/AuthProvider";
import {
  assertRecoveryIdentityIsolated,
  establishRecoverySession,
  takeRecoveryUrlParts,
  validateRecoveryPassword,
} from "../../../lib/auth-password-recovery";
import {
  createRecoveryAuthClient,
  getActiveRecoverySession,
  releaseActiveRecoverySession,
  rememberActiveRecoverySession,
} from "../../../lib/auth-password-recovery-client";
import { updatePasswordAndRevokePriorSessions } from "../../../lib/auth-password-security-client";

const MESSAGES = {
  verifying: "جاري التحقق من رابط الاستعادة...",
  missing: "رابط إعادة تعيين كلمة المرور غير صالح. اطلب رابطًا جديدًا من صفحة تسجيل الدخول.",
  invalid: "رابط إعادة تعيين كلمة المرور غير صالح أو تم استخدامه. اطلب رابطًا جديدًا.",
  expired: "انتهت صلاحية رابط إعادة تعيين كلمة المرور. اطلب رابطًا جديدًا.",
  mismatch:
    "يوجد حساب آخر مسجّل على هذا المتصفح. سجّل الخروج ثم أعد فتح رابط الاستعادة الخاص بك.",
  success: "تم تغيير كلمة المرور بنجاح. سجّل الدخول الآن بكلمة المرور الجديدة.",
};

function IconLock({ className = "h-4 w-4" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 118 0v3" />
    </svg>
  );
}

function LoginSpinner({ className = "h-5 w-5" }) {
  return (
    <svg className={`login-spinner ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path d="M12 3a9 9 0 019 9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export default function ResetPasswordClient() {
  const { authResolved, user } = useAuth();
  const recoveryClientRef = useRef(null);
  const recoveryAccessTokenRef = useRef(null);
  const recoveryUserRef = useRef(null);
  const [phase, setPhase] = useState("verifying");
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const applySession = (session) => {
      recoveryClientRef.current = session.client;
      recoveryUserRef.current = session.user;
      recoveryAccessTokenRef.current = session.accessToken;
      setPhase("established");
    };

    const run = async () => {
      const existing = getActiveRecoverySession();
      if (existing?.client && existing?.user?.id && existing?.accessToken) {
        applySession(existing);
        return;
      }

      const parsed = takeRecoveryUrlParts();
      if (parsed.kind === "missing" || parsed.kind === "unsupported") {
        await releaseActiveRecoverySession();
        if (!cancelled) {
          setPhase("blocked");
          setError(MESSAGES.missing);
        }
        return;
      }

      const client = createRecoveryAuthClient();
      const established = await establishRecoverySession(client, parsed);
      if (cancelled) return;

      if (!established.ok) {
        await releaseActiveRecoverySession();
        await client.auth.signOut({ scope: "local" }).catch(() => {});
        setPhase("blocked");
        setError(established.reason === "expired" ? MESSAGES.expired : MESSAGES.invalid);
        return;
      }

      const session = {
        client,
        user: established.user,
        accessToken: established.accessToken,
      };
      rememberActiveRecoverySession(session);
      applySession(session);
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (phase !== "established" || !authResolved) return;

    const identity = assertRecoveryIdentityIsolated({
      recoveryUserId: recoveryUserRef.current?.id,
      cookieUserId: user?.id,
    });

    if (!identity.ok) {
      recoveryAccessTokenRef.current = null;
      void releaseActiveRecoverySession();
      setPhase("blocked");
      setError(identity.reason === "session_mismatch" ? MESSAGES.mismatch : MESSAGES.invalid);
      return;
    }

    setPhase("ready");
  }, [phase, authResolved, user?.id]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting || phase !== "ready") return;

    const identity = assertRecoveryIdentityIsolated({
      recoveryUserId: recoveryUserRef.current?.id,
      cookieUserId: user?.id,
    });

    if (!identity.ok || !recoveryClientRef.current || !recoveryAccessTokenRef.current) {
      setPhase("blocked");
      setError(identity.reason === "session_mismatch" ? MESSAGES.mismatch : MESSAGES.invalid);
      return;
    }

    const validation = validateRecoveryPassword(password, confirmPassword);
    if (!validation.ok) {
      setError(validation.error);
      return;
    }

    setError("");
    setSubmitting(true);

    try {
      const result = await updatePasswordAndRevokePriorSessions(recoveryClientRef.current, {
        newPassword: password,
        previousAccessToken: recoveryAccessTokenRef.current,
        trigger: "password_recovery",
      });

      recoveryAccessTokenRef.current = null;
      await releaseActiveRecoverySession();
      recoveryClientRef.current = null;

      if (!result.ok) {
        setError(MESSAGES.invalid);
        setPhase("blocked");
        return;
      }

      setPassword("");
      setConfirmPassword("");
      setPhase("success");
    } catch {
      setError(MESSAGES.invalid);
      setPhase("blocked");
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = phase === "ready" && !submitting && authResolved;

  return (
    <main className="login-page">
      <div className="login-ambient" aria-hidden="true">
        <div className="login-ambient__base" />
        <div className="login-ambient__grid" />
        <div className="login-ambient__glow login-ambient__glow--center" />
      </div>

      <div className="login-shell-wrap">
        <section className="login-auth-region" aria-label="تعيين كلمة مرور جديدة">
          <div className="login-auth-region__inner">
            <div className="login-auth-region__header">
              <h1 className="login-auth-title text-xl font-black tracking-tight text-slate-900 md:text-2xl">
                تعيين كلمة مرور جديدة
              </h1>
              <p className="login-auth-desc mt-2 text-sm leading-relaxed text-slate-600 md:text-base">
                أدخل كلمة المرور الجديدة بعد التحقق من رابط الاستعادة.
              </p>
            </div>

            {phase === "verifying" || phase === "established" ? (
              <p className="rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm font-medium text-cyan-800">
                {MESSAGES.verifying}
              </p>
            ) : null}

            {phase === "success" ? (
              <div className="space-y-4">
                <p
                  role="status"
                  className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"
                >
                  {MESSAGES.success}
                </p>
                <Link
                  href="/login"
                  className="login-submit-btn flex w-full items-center justify-center rounded-2xl bg-gradient-to-l from-blue-700 via-blue-600 to-cyan-500 px-6 py-3.5 font-black text-white"
                >
                  الانتقال لتسجيل الدخول
                </Link>
              </div>
            ) : null}

            {phase === "blocked" ? (
              <div className="space-y-4">
                <p
                  role="alert"
                  className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
                >
                  {error}
                </p>
                <Link href="/login" className="block text-center text-sm font-bold text-cyan-700">
                  العودة لتسجيل الدخول وطلب رابط جديد
                </Link>
              </div>
            ) : null}

            {phase === "ready" ? (
              <form onSubmit={handleSubmit} className="space-y-3.5 md:space-y-4" noValidate>
                {error ? (
                  <p
                    role="alert"
                    className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
                  >
                    {error}
                  </p>
                ) : null}

                <div className="space-y-2">
                  <label htmlFor="reset-password" className="block text-sm font-bold text-slate-800">
                    كلمة المرور الجديدة
                  </label>
                  <input
                    id="reset-password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    dir="ltr"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    className="login-input w-full rounded-2xl px-4 py-3.5 text-start text-slate-900 outline-none placeholder:text-slate-400 md:px-5 md:py-4"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="reset-password-confirm" className="block text-sm font-bold text-slate-800">
                    تأكيد كلمة المرور
                  </label>
                  <input
                    id="reset-password-confirm"
                    name="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    dir="ltr"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    required
                    className="login-input w-full rounded-2xl px-4 py-3.5 text-start text-slate-900 outline-none placeholder:text-slate-400 md:px-5 md:py-4"
                  />
                </div>

                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="login-submit-btn group relative flex w-full items-center justify-center gap-2.5 overflow-hidden rounded-2xl bg-gradient-to-l from-blue-700 via-blue-600 to-cyan-500 px-6 py-3.5 font-black text-white disabled:cursor-not-allowed disabled:opacity-65 md:py-4"
                >
                  {submitting ? (
                    <>
                      <LoginSpinner className="h-5 w-5" />
                      <span>جاري تغيير كلمة المرور…</span>
                    </>
                  ) : (
                    <span>تغيير كلمة المرور</span>
                  )}
                </button>

                <p className="login-trust-line" role="note">
                  <IconLock className="login-trust-line__icon shrink-0" aria-hidden="true" />
                  <span>لا يمكن تغيير كلمة المرور إلا بعد التحقق من رابط الاستعادة</span>
                </p>
              </form>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
