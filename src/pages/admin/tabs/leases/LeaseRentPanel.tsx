import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { fmtMoney } from "@/lib/format";
import type { RentMonthState, RentSchedule } from "@contracts/leaseRent";

const STATE: Record<RentMonthState, { label: string; cls: string }> = {
  paid: { label: "已確認", cls: "border-ink/60 text-ink" },
  unpaid: { label: "未收", cls: "border-tang/70 text-tang" },
  missing: { label: "未開單", cls: "border-ochre-deep/60 text-ochre-deep" },
  free: { label: "免租", cls: "border-ink/30 text-ink/45" },
};

const linkBtn = "px-2 py-1 font-mono text-[11.5px] underline-offset-2 hover:underline disabled:opacity-40";

/**
 * 一份租約喺租約期內逐月嘅租金確認：每月狀態、金額、收款日，可以直接確認已收或者改回未收。
 * 確認收款日用今日；要記其他日子，去「04 租金按金」改。
 */
export default function LeaseRentPanel({ leaseId, schedule }: { leaseId: number; schedule: RentSchedule }) {
  const utils = trpc.useUtils();
  const refresh = () => {
    void utils.shop.admin.leaseRentOverview.invalidate();
    void utils.shop.admin.listRent.invalidate();
    void utils.shop.admin.stats.invalidate();
  };
  const confirm = trpc.shop.admin.confirmLeaseMonth.useMutation({
    onSuccess: (_r, v) => {
      toast.success(`${v.month} 租金已確認收款`);
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const unconfirm = trpc.shop.admin.markRentUnpaid.useMutation({
    onSuccess: () => {
      toast.success("已改回未收");
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const busy = confirm.isPending || unconfirm.isPending;
  const { summary } = schedule;

  return (
    <div className="bg-cream-2/40 px-4 pb-4 pt-3">
      <p className="mb-2 font-mono text-[11.5px] text-ink/55">
        租約期內共 {summary.totalMonths} 個月{summary.freeMonths > 0 && `（其中 ${summary.freeMonths} 個月整月免租，唔使收）`}。「確認已收」會喺未開單嘅月份自動開租金單，收款日記今日。
      </p>
      <ul className="border border-ink/15">
        {schedule.months.map((m) => (
          <li key={m.month} className="grid grid-cols-[5rem_4.5rem_1fr_auto] items-center gap-x-3 border-b border-ink/10 px-3 py-2 last:border-b-0">
            <span className="font-mono text-[12.5px]">{m.month}</span>
            <span className={`badge-frame w-fit border ${STATE[m.state].cls}`}>{STATE[m.state].label}</span>
            <span className="font-mono text-[12.5px]">
              {m.state === "free" ? <span className="text-ink/40">—</span> : <>${fmtMoney(m.amount)}</>}
              {m.paidAt && <span className="ml-3 text-ink/55">收款 {m.paidAt}</span>}
              {!m.due && (m.state === "missing" || m.state === "unpaid") && <span className="ml-3 text-ink/40">未到期</span>}
            </span>
            <span className="text-right">
              {(m.state === "missing" || m.state === "unpaid") && (
                <button disabled={busy} onClick={() => confirm.mutate({ leaseId, month: m.month })} className={`${linkBtn} text-ochre-deep`}>
                  確認已收
                </button>
              )}
              {m.state === "paid" && m.recordId !== null && (
                <button disabled={busy} onClick={() => unconfirm.mutate({ id: m.recordId! })} className={`${linkBtn} text-ink/50`}>
                  改回未收
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
      {summary.outsideRecords > 0 && (
        <p className="mt-2 text-[12px] text-tang">另有 {summary.outsideRecords} 張租金單唔喺租約期內（例如喺租約開始前開咗單），喺「04 租金按金」睇到，唔計入上面嘅數目。</p>
      )}
    </div>
  );
}
