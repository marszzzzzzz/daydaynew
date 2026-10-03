import { useMemo, useState } from "react";
import { askConfirm, askPrompt } from "@/components/AppDialog";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { fmtMoney, currentMonthStr, todayStr } from "@/lib/format";
import { downloadCsv } from "@/lib/csv";
import { shiftHours, shiftPay } from "@contracts/payroll";
import { SectionTitle, Field, ActionButton, EmptyRow } from "../ui";

/**
 * 10 兼職人工：員工時薪 → 每更返工記錄 → 每月人工（含強積金）→ 出糧鎖定
 */
export default function PayrollTab() {
  const [month, setMonth] = useState(currentMonthStr());
  const rules = trpc.payroll.rules.useQuery();

  return (
    <div className="space-y-14">
      <SectionTitle
        no="10 · Part-time Payroll"
        title="兼職人工"
        desc="記錄兼職員工每更返工時間，系統自動計工時、人工同強積金。出糧後該月更表會鎖定，數字唔會再變。"
      />
      <div className="flex flex-wrap items-end gap-5 border border-ink/25 p-5">
        <Field label="月份">
          <input type="month" className="underline-input !w-auto font-mono" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
        </Field>
        {rules.data && (
          <p className="font-mono text-[11px] leading-[1.8] text-ink/55">
            法定最低工資 ${rules.data.minWage}/小時 · 強積金 {rules.data.mpf.rate * 100}%（月入低過 ${fmtMoney(rules.data.mpf.minRelevantIncome)} 僱員唔使供；
            上限 ${fmtMoney(rules.data.mpf.maxRelevantIncome)}）
          </p>
        )}
      </div>
      <MonthSummary month={month} />
      <Shifts month={month} />
      <Employees />
    </div>
  );
}

function useInvalidate() {
  const utils = trpc.useUtils();
  return () => {
    void utils.payroll.listEmployees.invalidate();
    void utils.payroll.listShifts.invalidate();
    void utils.payroll.monthSummary.invalidate();
  };
}

// ─── 月結 ────────────────────────────────────────────────

function MonthSummary({ month }: { month: string }) {
  const invalidate = useInvalidate();
  const summary = trpc.payroll.monthSummary.useQuery({ month });
  const [paying, setPaying] = useState<number | null>(null);
  const [adj, setAdj] = useState("");
  const [paidAt, setPaidAt] = useState(todayStr());
  const [note, setNote] = useState("");

  const markPaid = trpc.payroll.markPaid.useMutation({
    onSuccess: (r) => {
      toast.success(`已出糧：實收 $${fmtMoney(r.net)}`);
      setPaying(null);
      setAdj("");
      setNote("");
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const unmark = trpc.payroll.unmarkPaid.useMutation({
    onSuccess: () => {
      toast.success("已取消出糧，該月更表已解鎖");
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const rows = summary.data?.rows ?? [];
  const t = summary.data?.totals;

  const exportCsv = () => {
    const head = ["月份", "員工", "更數", "工時", "基本人工", "調整", "總人工", "僱員強積金", "僱主強積金", "實收", "狀態", "出糧日期"];
    const lines = rows.map((r) =>
      [month, r.name, r.shifts, r.hours, r.base, r.adjustment, r.gross, r.mpfEmployee, r.mpfEmployer, r.net, r.paid ? "已出糧" : "未出糧", r.paid?.paidAt ?? ""]
        .map((v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v)))
        .join(","),
    );
    downloadCsv(`兼職人工-${month}.csv`, [head.join(","), ...lines].join("\n"));
  };

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="spec-label">Monthly payroll</p>
          <h3 className="font-display mt-1 text-xl font-black tracking-tight">{month} 月結</h3>
        </div>
        <ActionButton tone="ghost" disabled={!rows.length} onClick={exportCsv}>
          匯出 CSV
        </ActionButton>
      </div>

      {t && (
        <div className="mb-5 grid gap-[3px] border border-ink/25 bg-ink/10 sm:grid-cols-4">
          <Stat label="總工時" value={`${t.hours} 小時`} />
          <Stat label="總人工" value={`$${fmtMoney(t.gross)}`} />
          <Stat label="僱主強積金" value={`$${fmtMoney(t.mpfEmployer)}`} />
          <Stat label="店舖人工成本" value={`$${fmtMoney(t.employerCost)}`} strong />
        </div>
      )}

      <div className="overflow-x-auto border border-ink/25">
        <table className="ledger-table w-full min-w-[860px] text-[13.5px]">
          <thead>
            <tr className="text-left">
              <th className="py-3 pl-5 pr-4">員工</th>
              <th className="py-3 pr-4 text-right">更數</th>
              <th className="py-3 pr-4 text-right">工時</th>
              <th className="py-3 pr-4 text-right">總人工</th>
              <th className="py-3 pr-4 text-right">僱員強積金</th>
              <th className="py-3 pr-4 text-right">僱主強積金</th>
              <th className="py-3 pr-4 text-right">實收</th>
              <th className="py-3 pr-5 text-right">出糧</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.employeeId} className="align-top">
                <td className="py-3 pl-5 pr-4">
                  <span className="font-semibold">{r.name}</span>
                  {!r.mpfEnrolled && <span className="ml-2 font-mono text-[10.5px] text-ink/45">冇強積金</span>}
                  {r.belowMinWage && <p className="font-mono text-[10.5px] text-red-800">⚠ 有更時薪低過法定最低工資</p>}
                  {r.adjustment !== 0 && (
                    <p className="font-mono text-[10.5px] text-ink/50">
                      基本 ${fmtMoney(r.base)} · 調整 {r.adjustment > 0 ? "+" : ""}
                      {fmtMoney(r.adjustment)}
                    </p>
                  )}
                </td>
                <td className="py-3 pr-4 text-right font-mono">{r.shifts}</td>
                <td className="py-3 pr-4 text-right font-mono">{r.hours}</td>
                <td className="py-3 pr-4 text-right font-mono">${fmtMoney(r.gross)}</td>
                <td className="py-3 pr-4 text-right font-mono">${fmtMoney(r.mpfEmployee)}</td>
                <td className="py-3 pr-4 text-right font-mono">${fmtMoney(r.mpfEmployer)}</td>
                <td className="py-3 pr-4 text-right font-mono font-semibold">${fmtMoney(r.net)}</td>
                <td className="py-3 pr-5 text-right">
                  {r.paid ? (
                    <div className="font-mono text-[11.5px]">
                      <span className="badge-frame border border-ink/60">已出糧 {r.paid.paidAt}</span>
                      <button
                        onClick={async () => (await askConfirm(`取消 ${r.name} ${month} 嘅出糧記錄？更表會解鎖，人工會重新計。`)) && unmark.mutate({ employeeId: r.employeeId, month })}
                        className="mt-1 block w-full text-right text-ink/50 underline-offset-2 hover:underline"
                      >
                        取消出糧
                      </button>
                    </div>
                  ) : paying === r.employeeId ? (
                    <div className="ml-auto grid w-56 gap-2 text-left">
                      <input className="underline-input !py-1 font-mono text-[12.5px]" type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
                      <input
                        className="underline-input !py-1 font-mono text-[12.5px]"
                        inputMode="decimal"
                        value={adj}
                        onChange={(e) => setAdj(e.target.value)}
                        placeholder="調整（例如 +300 假期薪酬 / -50）"
                      />
                      <input className="underline-input !py-1 text-[12.5px]" value={note} onChange={(e) => setNote(e.target.value)} placeholder="備註（可留空）" />
                      <div className="flex justify-end gap-2">
                        <ActionButton tone="ghost" onClick={() => setPaying(null)}>
                          取消
                        </ActionButton>
                        <ActionButton
                          tone="ochre"
                          disabled={markPaid.isPending}
                          onClick={() => {
                            const a = adj.trim() ? Number(adj) : 0;
                            if (!Number.isFinite(a)) return toast.error("調整金額錯誤");
                            markPaid.mutate({ employeeId: r.employeeId, month, paidAt, adjustment: a, note: note || undefined });
                          }}
                        >
                          確認出糧
                        </ActionButton>
                      </div>
                    </div>
                  ) : (
                    <ActionButton tone="ochre" disabled={r.shifts === 0} onClick={() => setPaying(r.employeeId)}>
                      出糧
                    </ActionButton>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <EmptyRow colSpan={8} text={summary.isLoading ? "載入中…" : "未有員工；請喺下面「員工」新增"} />}
          </tbody>
        </table>
      </div>
      <p className="mt-2 font-mono text-[10.5px] leading-[1.8] text-ink/45">
        實收 = 總人工 − 僱員強積金。法定假日薪酬、有薪年假、獎金或扣減，請喺「出糧」時用「調整」加減（會計入強積金有關入息）。
      </p>
    </section>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="bg-cream px-5 py-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink/50">{label}</p>
      <p className={`mt-1.5 font-mono text-[16px] ${strong ? "font-bold" : "font-semibold"}`}>{value}</p>
    </div>
  );
}

// ─── 更表 ────────────────────────────────────────────────

function Shifts({ month }: { month: string }) {
  const invalidate = useInvalidate();
  const emps = trpc.payroll.listEmployees.useQuery();
  const [filter, setFilter] = useState<number | "">("");
  const list = trpc.payroll.listShifts.useQuery({ month, employeeId: filter || undefined });
  const summary = trpc.payroll.monthSummary.useQuery({ month });
  const paidIds = useMemo(() => new Set((summary.data?.rows ?? []).filter((r) => r.paid).map((r) => r.employeeId)), [summary.data]);
  const empName = useMemo(() => new Map((emps.data ?? []).map((e) => [e.id, e.name])), [emps.data]);
  const activeEmps = (emps.data ?? []).filter((e) => e.active);

  const [fEmp, setFEmp] = useState<number | "">("");
  const [fDate, setFDate] = useState(todayStr());
  const [fStart, setFStart] = useState("10:00");
  const [fEnd, setFEnd] = useState("18:00");
  const [fBreak, setFBreak] = useState("60");
  const [fRate, setFRate] = useState("");
  const [fNote, setFNote] = useState("");
  const selectedEmp = (emps.data ?? []).find((e) => e.id === fEmp);
  const previewRate = fRate.trim() ? Number(fRate) : Number(selectedEmp?.hourlyRate ?? 0);
  const previewHours = fStart && fEnd && fStart !== fEnd ? shiftHours(fStart, fEnd, Number(fBreak) || 0) : 0;

  const create = trpc.payroll.createShift.useMutation({
    onSuccess: () => {
      toast.success("已加入更表");
      setFNote("");
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const del = trpc.payroll.deleteShift.useMutation({
    onSuccess: () => {
      toast.success("已刪除");
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const rows = list.data ?? [];

  return (
    <section>
      <p className="spec-label">Shifts</p>
      <h3 className="font-display mb-4 mt-1 text-xl font-black tracking-tight">返工記錄</h3>

      <form
        className="grid gap-4 border border-ink/25 p-5 sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_.8fr_.8fr_.7fr_.7fr_auto] lg:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          if (!fEmp) return toast.error("請揀員工");
          const b = Number(fBreak || 0);
          if (!Number.isInteger(b) || b < 0) return toast.error("休息分鐘錯誤");
          const r = fRate.trim() ? Number(fRate) : undefined;
          if (r !== undefined && (!Number.isFinite(r) || r < 0)) return toast.error("時薪錯誤");
          create.mutate({ employeeId: Number(fEmp), workDate: fDate, startTime: fStart, endTime: fEnd, breakMinutes: b, hourlyRate: r, note: fNote || undefined });
        }}
      >
        <Field label="員工">
          <select
            className="w-full border border-ink/30 bg-cream px-3 py-2.5 text-[13.5px] outline-none focus:border-ink"
            value={fEmp}
            onChange={(e) => setFEmp(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">— 揀員工 —</option>
            {activeEmps.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}（${Number(e.hourlyRate)}/時）
              </option>
            ))}
          </select>
        </Field>
        <Field label="日期">
          <input type="date" className="underline-input font-mono" value={fDate} onChange={(e) => setFDate(e.target.value)} />
        </Field>
        <Field label="返工">
          <input type="time" className="underline-input font-mono" value={fStart} onChange={(e) => setFStart(e.target.value)} />
        </Field>
        <Field label="落更">
          <input type="time" className="underline-input font-mono" value={fEnd} onChange={(e) => setFEnd(e.target.value)} />
        </Field>
        <Field label="休息（分鐘）">
          <input className="underline-input font-mono" inputMode="numeric" value={fBreak} onChange={(e) => setFBreak(e.target.value)} />
        </Field>
        <Field label="時薪（可改）">
          <input
            className="underline-input font-mono"
            inputMode="decimal"
            value={fRate}
            onChange={(e) => setFRate(e.target.value)}
            placeholder={selectedEmp ? String(Number(selectedEmp.hourlyRate)) : "預設"}
          />
        </Field>
        <ActionButton tone="ochre" disabled={create.isPending}>
          {create.isPending ? "加入中…" : "加入"}
        </ActionButton>
        <div className="sm:col-span-2 lg:col-span-7">
          <input className="underline-input text-[13px]" value={fNote} onChange={(e) => setFNote(e.target.value)} placeholder="備註（可留空，例如：代更、公眾假期）" />
          <p className="mt-2 font-mono text-[11.5px] text-ink/55">
            呢更：{previewHours} 小時 × ${previewRate || 0} = <b>${fmtMoney(shiftPay(previewHours, previewRate || 0))}</b>
            {fStart && fEnd && fEnd < fStart ? "（跨午夜，計到翌日）" : ""}
          </p>
        </div>
      </form>

      <div className="mb-3 mt-6 flex items-center gap-3">
        <span className="font-mono text-[11.5px] text-ink/55">篩選：</span>
        <select
          className="border border-ink/30 bg-cream px-2 py-1.5 text-[13px] outline-none focus:border-ink"
          value={filter}
          onChange={(e) => setFilter(e.target.value ? Number(e.target.value) : "")}
        >
          <option value="">全部員工</option>
          {(emps.data ?? []).map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
        <span className="font-mono text-[11.5px] text-ink/55">{month} 共 {rows.length} 更</span>
      </div>

      <div className="overflow-x-auto border border-ink/25">
        <table className="ledger-table w-full min-w-[760px] text-[13.5px]">
          <thead>
            <tr className="text-left">
              <th className="py-3 pl-5 pr-4">日期</th>
              <th className="py-3 pr-4">員工</th>
              <th className="py-3 pr-4">時間</th>
              <th className="py-3 pr-4 text-right">休息</th>
              <th className="py-3 pr-4 text-right">工時</th>
              <th className="py-3 pr-4 text-right">時薪</th>
              <th className="py-3 pr-4 text-right">人工</th>
              <th className="py-3 pr-5 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => {
              const h = shiftHours(s.startTime, s.endTime, s.breakMinutes);
              const locked = paidIds.has(s.employeeId);
              return (
                <tr key={s.id} className="transition-colors hover:bg-ochre/10">
                  <td className="py-2.5 pl-5 pr-4 font-mono text-[12.5px]">{s.workDate}</td>
                  <td className="py-2.5 pr-4">
                    {empName.get(s.employeeId) ?? `#${s.employeeId}`}
                    {s.note && <p className="font-mono text-[10.5px] text-ink/45">{s.note}</p>}
                  </td>
                  <td className="py-2.5 pr-4 font-mono text-[12.5px]">
                    {s.startTime}–{s.endTime}
                    {s.endTime < s.startTime ? " (+1)" : ""}
                  </td>
                  <td className="py-2.5 pr-4 text-right font-mono">{s.breakMinutes} 分</td>
                  <td className="py-2.5 pr-4 text-right font-mono">{h}</td>
                  <td className="py-2.5 pr-4 text-right font-mono">${Number(s.hourlyRate)}</td>
                  <td className="py-2.5 pr-4 text-right font-mono font-semibold">${fmtMoney(shiftPay(h, Number(s.hourlyRate)))}</td>
                  <td className="py-2.5 pr-5 text-right font-mono text-[11.5px]">
                    {locked ? (
                      <span className="text-ink/40">已出糧 · 鎖定</span>
                    ) : (
                      <button onClick={async () => (await askConfirm("確定刪除呢更？", { danger: true, confirmLabel: "刪除" })) && del.mutate({ id: s.id })} className="px-2 py-1 text-red-800/80 underline-offset-2 hover:underline">
                        刪除
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && <EmptyRow colSpan={8} text={list.isLoading ? "載入中…" : `${month} 未有返工記錄`} />}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ─── 員工 ────────────────────────────────────────────────

function Employees() {
  const invalidate = useInvalidate();
  const emps = trpc.payroll.listEmployees.useQuery();
  const rules = trpc.payroll.rules.useQuery();
  const minWage = rules.data?.minWage ?? 0;

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [rate, setRate] = useState("");
  const [mpf, setMpf] = useState(true);

  const create = trpc.payroll.createEmployee.useMutation({
    onSuccess: () => {
      toast.success("已新增員工");
      setName("");
      setPhone("");
      setRate("");
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const update = trpc.payroll.updateEmployee.useMutation({
    onSuccess: () => {
      toast.success("已更新");
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const del = trpc.payroll.deleteEmployee.useMutation({
    onSuccess: async () => {
      toast.success("已刪除");
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <section>
      <p className="spec-label">Employees</p>
      <h3 className="font-display mb-4 mt-1 text-xl font-black tracking-tight">兼職員工</h3>

      <form
        className="grid gap-4 border border-ink/25 p-5 sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_.8fr_auto_auto] lg:items-end"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = Number(rate);
          if (!name.trim()) return toast.error("請輸入姓名");
          if (!rate.trim() || !Number.isFinite(r) || r < 0) return toast.error("請輸入時薪");
          if (r < minWage && !(await askConfirm(`時薪 $${r} 低過法定最低工資 $${minWage}，確定？`))) return;
          create.mutate({ name: name.trim(), phone: phone || undefined, hourlyRate: r, mpfEnrolled: mpf });
        }}
      >
        <Field label="姓名">
          <input className="underline-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="陳大文" />
        </Field>
        <Field label="電話">
          <input className="underline-input font-mono" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="可留空" />
        </Field>
        <Field label="時薪（港幣）">
          <input className="underline-input font-mono" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder={String(minWage || "")} />
        </Field>
        <label className="flex items-center gap-2 pb-2 text-[13px]">
          <input type="checkbox" checked={mpf} onChange={(e) => setMpf(e.target.checked)} />
          供強積金
        </label>
        <ActionButton tone="ochre" disabled={create.isPending}>
          新增員工
        </ActionButton>
      </form>
      <p className="mt-2 font-mono text-[10.5px] leading-[1.8] text-ink/45">
        受僱少於 60 日嘅員工一般可以豁免強積金（飲食及建造業除外），可以取消剔「供強積金」；做滿 60 日要記得改返。
      </p>

      <div className="mt-5 overflow-x-auto border border-ink/25">
        <table className="ledger-table w-full min-w-[680px] text-[13.5px]">
          <thead>
            <tr className="text-left">
              <th className="py-3 pl-5 pr-4">姓名</th>
              <th className="py-3 pr-4">電話</th>
              <th className="py-3 pr-4 text-right">時薪</th>
              <th className="py-3 pr-4">強積金</th>
              <th className="py-3 pr-4">狀態</th>
              <th className="py-3 pr-5 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {(emps.data ?? []).map((e) => (
              <tr key={e.id} className={e.active ? "" : "text-ink/40"}>
                <td className="py-2.5 pl-5 pr-4 font-semibold">{e.name}</td>
                <td className="py-2.5 pr-4 font-mono text-[12.5px]">{e.phone ?? "—"}</td>
                <td className="py-2.5 pr-4 text-right font-mono">
                  ${Number(e.hourlyRate)}
                  {Number(e.hourlyRate) < minWage && <span className="ml-1 text-red-800">⚠</span>}
                </td>
                <td className="py-2.5 pr-4">
                  <button className="font-mono text-[12px] underline-offset-2 hover:underline" onClick={() => update.mutate({ id: e.id, mpfEnrolled: !e.mpfEnrolled })}>
                    {e.mpfEnrolled ? "有供" : "豁免"}
                  </button>
                </td>
                <td className="py-2.5 pr-4 font-mono text-[12px]">{e.active ? "在職" : "停用"}</td>
                <td className="py-2.5 pr-5 text-right font-mono text-[11.5px]">
                  <button
                    className="px-2 py-1 text-ochre-deep underline-offset-2 hover:underline"
                    onClick={async () => {
                      const v = await askPrompt(`${e.name} 嘅新時薪（只影響之後新加嘅更）`, String(Number(e.hourlyRate)));
                      if (v == null) return;
                      const r = Number(v);
                      if (!Number.isFinite(r) || r < 0) return toast.error("時薪錯誤");
                      if (r < minWage && !(await askConfirm(`時薪 $${r} 低過法定最低工資 $${minWage}，確定？`))) return;
                      update.mutate({ id: e.id, hourlyRate: r });
                    }}
                  >
                    改時薪
                  </button>
                  <button className="px-2 py-1 text-ink/60 underline-offset-2 hover:underline" onClick={() => update.mutate({ id: e.id, active: !e.active })}>
                    {e.active ? "停用" : "恢復"}
                  </button>
                  <button className="px-2 py-1 text-red-800/80 underline-offset-2 hover:underline" onClick={async () => (await askConfirm(`確定刪除 ${e.name}？`, { danger: true, confirmLabel: "刪除" })) && del.mutate({ id: e.id })}>
                    刪除
                  </button>
                </td>
              </tr>
            ))}
            {(emps.data ?? []).length === 0 && <EmptyRow colSpan={6} text={emps.isLoading ? "載入中…" : "未有員工"} />}
          </tbody>
        </table>
      </div>
    </section>
  );
}
