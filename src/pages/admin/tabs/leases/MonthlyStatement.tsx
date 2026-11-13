import { useState } from "react";
import { toast } from "sonner";
import { askConfirm } from "@/components/AppDialog";
import { trpc } from "@/providers/trpc";
import { currentMonthStr, fmtMoney } from "@/lib/format";
import { previousMonth } from "@contracts/statement";
import { ActionButton, Field } from "../../ui";
import StatementTable from "./StatementTable";
import StatementHistory from "./StatementHistory";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const when = (d: Date | string) => new Date(d).toLocaleString("zh-HK", { timeZone: "Asia/Hong_Kong", hour12: false, dateStyle: "medium", timeStyle: "short" });

/**
 * 租約管理 · 租戶月結單：揀租戶同月份，自動列出每格銷售、payroll、租金、payback；
 * 核對後撳「確認」存成當月月結單（之後改銷售／租金都唔會跟住變），下面記錄每個租戶每月 payback 總數。
 */
export default function MonthlyStatement({ tenants }: { tenants: { id: number; name: string }[] }) {
  const utils = trpc.useUtils();
  const [tenantId, setTenantId] = useState<number | "">("");
  const [month, setMonth] = useState(() => previousMonth(currentMonthStr()));
  const [historyTenant, setHistoryTenant] = useState<number | "">("");

  const ready = tenantId !== "" && MONTH_RE.test(month);
  const preview = trpc.shop.admin.statementPreview.useQuery({ tenantId: Number(tenantId), month }, { enabled: ready });
  const d = ready ? preview.data : undefined;

  const refresh = () => {
    void utils.shop.admin.statementPreview.invalidate();
    void utils.shop.admin.listStatements.invalidate();
  };
  const confirm = trpc.shop.admin.confirmStatement.useMutation({
    onSuccess: (r) => {
      toast.success(`月結單已確認，Payback 合計 $${fmtMoney(r.totals.payback)}`);
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const remove = trpc.shop.admin.deleteStatement.useMutation({
    onSuccess: () => {
      toast.success("月結單已撤銷，可以重新核對再確認");
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  const view = d?.confirmed ?? d?.live;
  const onConfirm = async () => {
    if (!d || tenantId === "") return;
    const msg = `確認 ${d.tenantName} ${month} 月結單？Payback 合計 $${fmtMoney(d.live.totals.payback)}。確認後會存低呢份數，之後改銷售或者租金都唔會跟住變。`;
    if (await askConfirm(msg, { confirmLabel: "確認月結單" })) confirm.mutate({ tenantId, month });
  };
  const onRemove = async () => {
    if (!d?.confirmed) return;
    if (await askConfirm(`撤銷 ${d.tenantName} ${month} 嘅月結單？撤銷後數字會按最新銷售同租金重新計。`, { danger: true, confirmLabel: "撤銷月結單" })) remove.mutate({ id: d.confirmed.id });
  };

  return (
    <section className="mt-16" aria-labelledby="statement-title">
      <h2 id="statement-title" className="font-display text-xl font-black tracking-tight">租戶月結單</h2>
      <p className="mt-1 max-w-3xl text-[13px] leading-[1.8] text-ink/65">
        揀租戶同月份，自動列出每格嗰個月嘅銷售、payroll（銷售 × 100%）、租金同 payback（俾返租客，等於該格銷售；租金只係列出，唔扣）。核對後撳「確認」存成月結單。
      </p>

      <div className="mt-5 flex flex-wrap items-end gap-5 border border-ink/25 p-5">
        <Field label="租戶">
          <select className="underline-input !w-auto min-w-[10rem] bg-transparent" value={tenantId} onChange={(e) => setTenantId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">揀租戶</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </Field>
        <Field label="月份">
          <input type="month" className="underline-input !w-auto font-mono" value={month} onChange={(e) => setMonth(e.target.value)} />
        </Field>
      </div>

      {!ready ? (
        <p className="mt-6 text-[13px] text-ink/50">揀咗租戶同月份就會自動列出數字。</p>
      ) : !d ? (
        <p className="mt-6 text-[13px] text-ink/50">{preview.error ? `載入唔到：${preview.error.message}` : "載入中…"}</p>
      ) : !view || view.lines.length === 0 ? (
        <p className="mt-6 text-[13px] text-ink/60">{d.tenantName} {month} 冇可以結算嘅格仔（冇銷售，亦冇生效租約）。</p>
      ) : (
        <div className="mt-6">
          {d.confirmed ? (
            <div className="mb-3 border border-ink/60 bg-ink/5 px-4 py-3 text-[13px]">
              <b>已確認</b> · {when(d.confirmed.confirmedAt)} · 下面係確認時存低嘅數字，之後唔會跟住變。
              {d.changedSince && (
                <p className="mt-1.5 text-tang">
                  確認之後銷售或者租金有變動：而家實時計出嚟係 Payback ${fmtMoney(d.live.totals.payback)}（存低嗰份係 ${fmtMoney(d.confirmed.totals.payback)}）。要用新數字，就要先撤銷再重新確認。
                </p>
              )}
            </div>
          ) : (
            <p className="mb-3 text-[12.5px] text-ink/60">未確認 · 下面係實時計出嚟嘅數字。</p>
          )}
          <StatementTable lines={view.lines} totals={view.totals} payrollRate={d.confirmed?.payrollRate ?? d.payrollRate} />
          <div className="mt-4 flex flex-wrap items-center gap-4">
            {d.confirmed ? (
              <ActionButton tone="red" disabled={remove.isPending} onClick={onRemove}>
                {remove.isPending ? "撤銷中…" : "撤銷月結單"}
              </ActionButton>
            ) : (
              <ActionButton tone="ochre" disabled={confirm.isPending} onClick={onConfirm}>
                {confirm.isPending ? "確認中…" : "確認月結單"}
              </ActionButton>
            )}
            {!d.confirmed && month >= currentMonthStr() && <span className="text-[12px] text-ink/50">本月未完，確認後本月再有銷售都唔會計入；通常月尾先確認。</span>}
          </div>
        </div>
      )}

      <StatementHistory
        tenants={tenants}
        tenantId={historyTenant}
        onTenant={setHistoryTenant}
        onOpen={(id, m) => {
          setTenantId(id);
          setMonth(m);
          document.getElementById("statement-title")?.scrollIntoView({ behavior: "smooth" });
        }}
      />
    </section>
  );
}
