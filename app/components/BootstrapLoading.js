"use client";
import { ui } from "./ui/ui-theme";
function BootstrapBrandMark() {
  return (
    <div className={ui.bootstrapLogo}>
      {" "}
      <div className={ui.bootstrapLogoGlow} aria-hidden="true" />{" "}
      <div className={ui.bootstrapLogoShine} aria-hidden="true" />{" "}
      <div className="relative z-10 flex flex-col items-center leading-none">
        {" "}
        <div className="relative mb-1 h-8 w-12">
          {" "}
          <span className={ui.bootstrapBarShort} />{" "}
          <span className={ui.bootstrapBarMid} />{" "}
          <span className={ui.bootstrapBarTall} />{" "}
          <svg
            viewBox="0 0 80 50"
            className="ui-bootstrap-logo__chart absolute -top-1 right-0 h-10 w-14"
            fill="none"
          >
            {" "}
            <path
              d="M6 38 L26 24 L40 31 L68 8"
              strokeWidth="7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />{" "}
            <path
              d="M55 7 H69 V21"
              strokeWidth="7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />{" "}
          </svg>{" "}
        </div>{" "}
        <span className="ui-bootstrap-logo__text text-2xl font-black tracking-tight">
          HC
        </span>{" "}
      </div>{" "}
    </div>
  );
}
export default function BootstrapLoading({ exiting = false }) {
  return (
    <div
      className={`${ui.bootstrapScreen}${exiting ? ` ${ui.bootstrapExit}` : ""}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="جاري تجهيز منصة HasaN CharT World"
    >
      {" "}
      <div className={ui.bootstrapBg} /> <div className={ui.bootstrapGrid} />{" "}
      <div className={ui.bootstrapOrbPrimary} />{" "}
      <div className={ui.bootstrapOrbSecondary} />{" "}
      <div className={ui.bootstrapContent}>
        {" "}
        <div className={ui.bootstrapSurface}>
          {" "}
          <div className={ui.bootstrapCardGlow} aria-hidden="true" />{" "}
          <div className={ui.bootstrapCardLine} aria-hidden="true" />{" "}
          <span className="badgeGreen relative z-10 mb-7 inline-flex">
            LIVE TRADING INTELLIGENCE
          </span>{" "}
          <div className="relative z-10 mx-auto mb-8 flex h-[7.75rem] w-[7.75rem] items-center justify-center">
            {" "}
            <div className={ui.bootstrapRingGlow} aria-hidden="true" />{" "}
            <div className={ui.bootstrapRing} aria-hidden="true">
              {" "}
              <div className={ui.bootstrapRingInner} />{" "}
            </div>{" "}
            <BootstrapBrandMark />{" "}
          </div>{" "}
          <h1 className={ui.bootstrapTitle}>
            جاري تجهيز منصة HasaN CharT World
          </h1>{" "}
          <p className={ui.bootstrapSubtitle}>
            يتم تهيئة بيانات السوق والجلسة بشكل آمن...
          </p>{" "}
          <div
            className="relative z-10 mt-8 flex items-center justify-center gap-2.5"
            aria-hidden="true"
          >
            {" "}
            <span className={ui.bootstrapDot} />{" "}
            <span className={ui.bootstrapDotDelay1} />{" "}
            <span className={ui.bootstrapDotDelay2} />{" "}
          </div>{" "}
        </div>{" "}
        <p className={ui.bootstrapTagline}>
          Market Data • Secure Session • Live Intelligence
        </p>{" "}
      </div>{" "}
    </div>
  );
}
