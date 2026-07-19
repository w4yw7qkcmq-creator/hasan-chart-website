"use client";

import { useRouter } from "next/navigation";

export default function AdminOverviewNavLink({
  href,
  gradientClass,
  hoverClasses,
  eyebrow,
  title,
  description,
  icon,
}) {
  const router = useRouter();

  const handleNavigate = (event) => {
    event.preventDefault();
    event.stopPropagation();
    router.push(href);
  };

  return (
    <a
      href={href}
      onClick={handleNavigate}
      onMouseDown={(event) => event.stopPropagation()}
      className={`group relative z-[121] block cursor-pointer overflow-hidden rounded-[28px] border border-cyan-300/15 bg-white/[0.045] p-6 shadow-2xl backdrop-blur-2xl transition duration-200 pointer-events-auto ${hoverClasses}`}
    >
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${gradientClass} opacity-80 transition group-hover:opacity-100`}
      />
      <div className="relative z-10 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-slate-300">{eyebrow}</p>
          <h3 className="mt-3 text-2xl font-black text-white">{title}</h3>
          <p className="mt-2 text-sm text-slate-300">{description}</p>
        </div>
        <div className="pointer-events-none grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-cyan-300/20 bg-black/25 text-2xl shadow-[0_0_30px_rgba(0,163,255,0.18)] transition group-hover:scale-105">
          {icon}
        </div>
      </div>
    </a>
  );
}
