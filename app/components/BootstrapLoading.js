"use client";

function BootstrapBrandMark() {
  return (
    <div className="relative z-10 grid h-24 w-24 place-items-center overflow-hidden rounded-[28px] border border-cyan-300/30 bg-gradient-to-br from-[#0b63ff]/35 via-[#00a3ff]/15 to-[#020617] shadow-[0_0_50px_rgba(0,163,255,0.35)] bootstrapScreen__logo">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(125,211,252,0.45),transparent_35%)]" />
      <div className="absolute bottom-0 left-0 h-1/2 w-full bg-gradient-to-t from-cyan-400/15 to-transparent" />
      <div className="relative z-10 flex flex-col items-center leading-none">
        <div className="relative mb-1 h-8 w-12">
          <span className="absolute bottom-0 right-0 h-4 w-2 rounded bg-cyan-300" />
          <span className="absolute bottom-0 right-4 h-6 w-2 rounded bg-blue-400" />
          <span className="absolute bottom-0 right-8 h-8 w-2 rounded bg-white bootstrapScreen__bar" />
          <svg viewBox="0 0 80 50" className="absolute -top-1 right-0 h-10 w-14 bootstrapScreen__chart" fill="none">
            <path
              d="M6 38 L26 24 L40 31 L68 8"
              stroke="white"
              strokeWidth="7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M55 7 H69 V21"
              stroke="white"
              strokeWidth="7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <span className="text-2xl font-black tracking-tight text-white drop-shadow-[0_0_12px_rgba(34,211,238,0.45)] bootstrapScreen__logoText">
          HC
        </span>
      </div>
    </div>
  );
}

export default function BootstrapLoading({ exiting = false }) {
  return (
    <div
      className={`bootstrapScreen fixed inset-0 z-[9998] flex min-h-screen items-center justify-center overflow-hidden${exiting ? " bootstrapScreen--exit" : ""}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="جاري تجهيز منصة HasaN CharT World"
    >
      <div className="bootstrapScreen__bg pointer-events-none absolute inset-0" />
      <div className="bootstrapScreen__grid pointer-events-none absolute inset-0" />
      <div className="bootstrapScreen__orb bootstrapScreen__orb--one pointer-events-none absolute" />
      <div className="bootstrapScreen__orb bootstrapScreen__orb--two pointer-events-none absolute" />

      <div className="bootstrapScreen__content relative z-10 w-full max-w-xl px-5 sm:px-6">
        <div className="glassPanel bootstrapScreen__card relative overflow-hidden rounded-[34px] border border-cyan-300/15 p-8 text-center shadow-[0_25px_90px_rgba(0,102,255,0.18)] backdrop-blur-2xl md:p-10">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.24),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(34,211,238,0.16),transparent_38%)]" />
          <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/40 to-transparent" />

          <span className="badgeGreen relative z-10 mb-7 inline-flex">LIVE TRADING INTELLIGENCE</span>

          <div className="relative z-10 mx-auto mb-8 flex h-[7.75rem] w-[7.75rem] items-center justify-center">
            <div className="bootstrapScreen__ringGlow pointer-events-none absolute inset-[-10px] rounded-[36px]" aria-hidden="true" />
            <div className="bootstrapScreen__ring pointer-events-none absolute inset-0 rounded-[32px]" aria-hidden="true">
              <div className="bootstrapScreen__ringInner absolute inset-[3px] rounded-[29px]" />
            </div>
            <BootstrapBrandMark />
          </div>

          <h1 className="bootstrapScreen__title relative z-10 text-2xl font-black leading-tight tracking-tight md:text-[1.75rem]">
            جاري تجهيز منصة HasaN CharT World
          </h1>
          <p className="bootstrapScreen__subtitle relative z-10 mt-3 text-sm leading-7 md:text-base">
            يتم تهيئة بيانات السوق والجلسة بشكل آمن...
          </p>

          <div className="relative z-10 mt-8 flex items-center justify-center gap-2.5" aria-hidden="true">
            <span className="bootstrapScreen__dot" />
            <span className="bootstrapScreen__dot bootstrapScreen__dot--delay-1" />
            <span className="bootstrapScreen__dot bootstrapScreen__dot--delay-2" />
          </div>
        </div>

        <p className="bootstrapScreen__tagline mt-5 text-center text-[11px] font-bold uppercase tracking-[0.24em]">
          Market Data • Secure Session • Live Intelligence
        </p>
      </div>
    </div>
  );
}
