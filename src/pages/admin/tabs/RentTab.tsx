import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { toast } from "sonner";
import { fmtMoney, currentMonthStr } from "@/lib/format";
import { SectionTitle, Field, ActionButton, EmptyRow, statusBadge, statusLabel } from "../ui";

export default function RentTab() {
  const utils = trpc.useUtils();
  const [month, setMonth] = useState(currentMonthStr());

  const rent = trpc.shop.admin.listRent.useQuery({ month: month || undefined });
  const leases = trpc.shop.admin.listLeases.useQuery();
  const activeLeases = (leases.data ?? []).filter((l) => l.status === "active");

  // 新增記錄
  const [fLease, setFLease] = useState<number | "">("");
  const [fMonth, setFMonth] = useState(currentMonthStr());
  const [fType, setFType] = useState<"rent" | "deposit">("rent");
  const [fAmount, setFAmount] = useState("");
  const [fNote, setFNote] = useState("");

  const invalidate = () => {
    utils.shop.admin.listRent.invalidate();
    utils.shop.admin.stats.invalidate();
  };

  const generate = trpc.shop.admin.generateMonthRent.useMutation({
    onSuccess: (r) => {
      toast.success(`已開立 ${r.created} 張租金單${r.skipped ? `（${r.skipped} 張已存在，略過）` : ""}`);
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const create = trpc.shop.admin.createRentRecord.useMutation({
    onSuccess: () => {
      toast.success("已新增記錄");
      setFAmount("");
      setFNote("");
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const markPaid = trpc.shop.admin.markRentPaid.useMutation({ onSuccess: () => { toast.success("已標記為已收"); invalidate(); }, onError: (e) => toast.error(e.message) });
  const markUnpaid = trpc.shop.admin.markRentUnpaid.useMutation({ onSuccess: () => { toast.success("已標記為未收"); invalidate(); }, onError: (e) => toast.error(e.message) });
  const del = trpc.shop.admin.deleteRentRecord.useMutation({ onSuccess: () => { toast.success("已刪除"); invalidate(); }, onError: (e) => toast.error(e.message) });

  const rows = rent.data ?? [];
  const unpaidTotal = rows.filter((r) => r.status === "unpaid").reduce((a, r) => a + Number(r.amount), 0);

  return (
    <div>
      <SectionTitle
        no="04 · Rent & Deposit"
        title="租金及按金"
        desc="每月為生效租約批量開立租金單，亦可以單獨記錄按金。收款後標記「已收」。"
      />

      {/* 批量開單 */}
      <div className="flex flex-wrap items-end gap-5 border border-ink/25 p-6">
        <Field label="月份">
          <input type="month" className="underline-input !w-auto font-mono" value={month} onChange={(e) => setMonth(e.target.value)} />
        </Field>
        <ActionButton tone="ochre" disabled={generate.isPending || !month} onClick={() => generate.mutate({ month })}>
          {generate.isPending ? "開立中…" : `開立 ${month} 全部租金單`}
        </ActionButton>
        <p className="font-mono text-[11.5px] text-ink/50">該月份未收合共 ${fmtMoney(unpaidTotal)}</p>
      </div>

      {/* 單獨新增 */}
      <form
        className="mt-6 grid gap-5 border border-ink/25 p-6 md:grid-cols-[1fr_140px_120px_150px_1fr_auto] md:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          const amount = Number(fAmount);
          if (!fLease) return toast.error("請揀租約");
          if (!Number.isFinite(amount) || amount < 0) return toast.error("金額錯誤");
          create.mutate({ leaseId: Number(fLease), month: fMonth, type: fType, amount, note: fNote || undefined });
        }}
      >
        <Field label="租約（格仔 · 租戶）">
          <select className="underline-input w-full bg-transparent font-mono" value={fLease} onChange={(e) => setFLease(e.target.value ? Number(e.target.value) : "")}>
            <option value="">揀租約</option>
            {activeLeases.map((l) => (
              <option key={l.id} value={l.id}>{l.gridCode} · {l.tenantName}</option>
            ))}
          </select>
        </Field>
        <Field label="月份">
          <input type="month" className="underline-input font-mono" value={fMonth} onChange={(e) => setFMonth(e.target.value)} />
        </Field>
        <Field label="類型">
          <select className="underline-input w-full bg-transparent" value={fType} onChange={(e) => setFType(e.target.value as "rent" | "deposit")}>
            <option value="rent">租金</option>
            <option value="deposit">按金</option>
          </select>
        </Field>
        <Field label="金額 HKD">
          <input className="underline-input font-mono" value={fAmount} onChange={(e) => setFAmount(e.target.value)} placeholder="500" inputMode="decimal" />
        </Field>
        <Field label="備註">
          <input className="underline-input" value={fNote} onChange={(e) => setFNote(e.target.value)} placeholder="可留空" />
        </Field>
        <ActionButton disabled={create.isPending}>{create.isPending ? "新增中…" : "+ 新增"}</ActionButton>
      </form>

      {/* 列表 */}
      <div className="mt-10 overflow-x-auto">
        <table className="ledger-table w-full min-w-[720px] text-[13.5px]">
          <thead>
            <tr className="text-left">
              <th className="py-3 pr-4">月份</th>
              <th className="py-3 pr-4">類型</th>
              <th className="py-3 pr-4">格仔</th>
              <th className="py-3 pr-4">租戶</th>
              <th className="py-3 pr-4 text-right">金額</th>
              <th className="py-3 pr-4">狀態</th>
              <th className="py-3 pr-4">收款日</th>
              <th className="py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="transition-colors hover:bg-ochre/10">
                <td className="py-3 pr-4 font-mono text-[12.5px]">{r.month}</td>
                <td className="py-3 pr-4">{statusLabel[r.type]}</td>
                <td className="py-3 pr-4 font-mono text-[12.5px] font-semibold">{r.gridCode}</td>
                <td className="py-3 pr-4">{r.tenantName}</td>
                <td className="py-3 pr-4 text-right font-mono font-semibold">${fmtMoney(r.amount)}</td>
                <td className="py-3 pr-4">
                  <span className={`badge-frame border ${statusBadge[r.status]}`}>{statusLabel[r.status]}</span>
                </td>
                <td className="py-3 pr-4 font-mono text-[12.5px]">{r.paidAt ?? "—"}</td>
                <td className="py-3 text-right">
                  <div className="flex justify-end gap-2">
                    {r.status === "unpaid" ? (
                      <button onClick={() => markPaid.mutate({ id: r.id })} className="px-2 py-1 font-mono text-[11.5px] text-ochre-deep underline-offset-2 hover:underline">
                        標記已收
                      </button>
                    ) : (
                      <button onClick={() => markUnpaid.mutate({ id: r.id })} className="px-2 py-1 font-mono text-[11.5px] text-ink/50 underline-offset-2 hover:underline">
                        改回未收
                      </button>
                    )}
                    <button onClick={() => { if (confirm("確定刪除呢條記錄？")) del.mutate({ id: r.id }); }} className="px-2 py-1 font-mono text-[11.5px] text-red-800/80 underline-offset-2 hover:underline">
                      刪除
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <EmptyRow colSpan={8} text={rent.isLoading ? "載入中…" : `${month} 未有記錄`} />}
          </tbody>
        </table>
      </div>
    </div>
  );
}
