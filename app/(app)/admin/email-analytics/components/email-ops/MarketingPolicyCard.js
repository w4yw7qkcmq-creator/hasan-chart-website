import { IconShield } from "../icons-ops";

export function MarketingPolicyCard() {
  return (
    <section className="rounded-[24px] border border-cyan-200/70 bg-gradient-to-l from-cyan-50 via-blue-50 to-white p-5 dark:border-cyan-400/20 dark:from-cyan-500/10 dark:via-blue-500/5 dark:to-transparent">
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-cyan-200 bg-white text-cyan-700 dark:border-cyan-300/20 dark:bg-cyan-500/10 dark:text-cyan-200">
          <IconShield className="h-5 w-5" />
        </div>
        <div>
          <h3 className="font-black text-slate-900 dark:text-white">حملة تسويقية</h3>
          <p className="mt-2 text-sm leading-7 text-slate-700 dark:text-slate-200">
            هذه الرسالة ستصل فقط إلى المستخدمين الذين وافقوا صراحة على استقبال الرسائل التسويقية.
          </p>
          <p className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">
            لا يمكن تجاوز الموافقة التسويقية من هذه الشاشة.
          </p>
        </div>
      </div>
    </section>
  );
}
