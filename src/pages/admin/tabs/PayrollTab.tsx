import { useMemo, useState } from "react";
import { askConfirm, askPrompt } from "@/components/AppDialog";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { fmtMoney, currentMonthStr, todayStr } from "@/lib/format";
import { downloadCsv } from "@/lib/csv";
import { shiftHours, shiftPay } from "@contracts/payroll";
import { formatDuration } from "@contracts/attendance";
import AttendanceImport from "@/components/AttendanceImport";
import { SectionTitle, Field, ActionButton, EmptyRow } from "../ui";

/**
 * 10 兼職人工：匯入考勤機 CSV（或者手動加更）→ 每月人工 → 出糧鎖定
 * 店舖兼職員工冇供強積金，實收 = 總人工。
 */
export default function PayrollTab() {
  const [month, setMonth] = useState(currentMonthStr());
  const rules = trpc.payroll.rules.useQuery();

  return (
    <div className="space-y-14">
      <SectionTitle
        no="10 · Part-time Payroll"
        title="兼職人工"
        desc="匯入考勤機嘅「員工考勤_明細」CSV，系統自動記錄每位員工當月工時同計人工；考勤機冇記到嘅更可以手動補。出糧後該月記錄會鎖定，數字唔會再變。"
      />
      <div className="flex flex-wrap items-end gap-5 border border-ink/25 p-5">
        <Field label="月份">
          <input type="month" className="underline-input !w-auto font-mono" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
        </Field>
        {rules.data && <p className="font-mono text-[11px] leading-[1.8] text-ink/55">法定最低工資 ${rules.data.minWage}/小時 · 人工 = 工時 × 時薪（冇強積金）</p>}
      </div>
      <AttendanceImport month={month} minWage={rules.data?.minWage ?? 0} onImported={setMonth} />
      <MonthSummary month={month} />
      <AttendanceList month={month} />
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
    void utils.payroll.listAttendance.invalidate();
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
      toast.success(`已出糧：$${fmtMoney(r.gross)}`);
      setPaying(null);
      setAdj("");
      setNote("");
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const unmark = trpc.payroll.unmarkPaid.useMutation({
    onSuccess: () => {
      toast.success("已取消出糧，該月記錄已解鎖");
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const rows = summary.data?.rows ?? [];
  const t = summary.data?.totals;

  const exportCsv = () => {
    const head = ["月份", "工號", "員工", "上班次數", "工時", "基本人工", "調整", "人工", "狀態", "出糧日期"];
    const lines = rows.map((r) =>
      [month, r.staffCode ?? "", r.name, r.shifts, r.hours, r.base, r.adjustment, r.gross, r.paid ? "已出糧" : "未出糧", r.paid?.paidAt ?? ""]
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
          <Stat label="總人工" value={`$${fmtMoney(t.gross)}`} strong />
          <Stat label="已出糧" value={`$${fmtMoney(t.paidGross)}`} />
          <Stat label="未出糧" value={`${t.unpaidCount} 位`} />
        </div>
      )}

      <div className="overflow-x-auto border border-ink/25">
        <table className="ledger-table w-full min-w-[640px] text-[13.5px]">
          <thead>
            <tr className="text-left">
              <th className="py-3 pl-5 pr-4">員工</th>
              <th className="py-3 pr-4 text-right">上班次數</th>
              <th className="py-3 pr-4 text-right">工時</th>
              <th className="py-3 pr-4 text-right">人工</th>
              <th className="py-3 pr-5 text-right">出糧</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.employeeId} className="align-top">
                <td className="py-3 pl-5 pr-4">
                  {r.staffCode && <span className="mr-2 font-mono text-[11px] text-ink/50">{r.staffCode}</span>}
                  <span className="font-semibold">{r.name}</span>
                  {r.sources.attendanceHours > 0 && r.sources.manualShifts > 0 && (
                    <p className="font-mono text-[10.5px] text-ink/50">
                      考勤 {r.sources.attendanceHours} 小時 + 手動 {r.sources.manualShifts} 更
                    </p>
                  )}
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
                <td className="py-3 pr-4 text-right font-mono font-semibold">${fmtMoney(r.gross)}</td>
                <td className="py-3 pr-5 text-right">
                  {r.paid ? (
                    <div className="font-mono text-[11.5px]">
                      <span className="badge-frame border border-ink/60">已出糧 {r.paid.paidAt}</span>
                      <button
                        onClick={async () => (await askConfirm(`取消 ${r.name} ${month} 嘅出糧記錄？考勤同更表會解鎖，人工會重新計。`)) && unmark.mutate({ employeeId: r.employeeId, month })}
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
                    <ActionButton tone="ochre" disabled={r.hours === 0} onClick={() => setPaying(r.employeeId)}>
                      出糧
                    </ActionButton>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <EmptyRow colSpan={5} text={summary.isLoading ? "載入中…" : "未有員工；匯入考勤 CSV 會自動新增"} />}
          </tbody>
        </table>
      </div>
      <p className="mt-2 font-mono text-[10.5px] leading-[1.8] text-ink/45">
        人工 = 考勤工時 × 時薪 + 手動加更。法定假日薪酬、有薪年假、獎金或扣減，請喺「出糧」時用「調整」加減。
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

// ─── 考勤記錄（CSV 匯入） ─────────────────────────────────

function AttendanceList({ month }: { month: string }) {
  const invalidate = useInvalidate();
  const list = trpc.payroll.listAttendance.useQuery({ month });
  const rules = trpc.payroll.rules.useQuery();
  const minWage = rules.data?.minWage ?? 0;
  const [editing, setEditing] = useState<number | null>(null);
  const [fHours, setFHours] = useState("");
  const [fRate, setFRate] = useState("");
  const [fPay, setFPay] = useState("");
  const [fNote, setFNote] = useState("");

  const update = trpc.payroll.updateAttendance.useMutation({
    onSuccess: (r) => {
      toast.success(`已更新：人工 $${fmtMoney(r.pay)}`);
      setEditing(null);
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const del = trpc.payroll.deleteAttendance.useMutation({
    onSuccess: () => {
      toast.success("已刪除考勤記錄");
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const rows = list.data ?? [];

  const startEdit = (a: (typeof rows)[number]) => {
    setEditing(a.id);
    setFHours(String(Number(a.hours)));
    setFRate(String(Number(a.hourlyRate)));
    setFPay(a.payOverride !== null ? String(Number(a.payOverride)) : "");
    setFNote(a.note ?? "");
  };
  const h = Number(fHours);
  const r = Number(fRate);
  const autoPay = Number.isFinite(h) && Number.isFinite(r) ? shiftPay(h, r) : 0;

  const save = (id: number) => {
    if (!fHours.trim() || !Number.isFinite(h) || h < 0) return toast.error("工時錯誤");
    if (!fRate.trim() || !Number.isFinite(r) || r < 0) return toast.error("時薪錯誤");
    const p = fPay.trim() ? Number(fPay) : null;
    if (p !== null && (!Number.isFinite(p) || p < 0)) return toast.error("人工錯誤");
    update.mutate({ id, hours: h, hourlyRate: r, pay: p, note: fNote || undefined });
  };

  const cell = "w-full border border-ink/40 bg-cream px-2 py-1 text-right font-mono text-[13px] outline-none focus:border-ink";

  return (
    <section>
      <p className="spec-label">Attendance</p>
      <h3 className="font-display mt-1 text-xl font-black tracking-tight">{month} 考勤記錄</h3>
      <p className="mb-4 mt-1.5 text-[13px] text-ink/60">按「修改」可以改工時、時薪或者直接改人工（例如補鐘、扣錢）。人工留空 = 自動按 工時 × 時薪 計。</p>
      <div className="overflow-x-auto border border-ink/25">
        <table className="ledger-table w-full min-w-[820px] text-[13.5px]">
          <thead>
            <tr className="text-left">
              <th className="py-3 pl-5 pr-4">工號</th>
              <th className="py-3 pr-4">員工</th>
              <th className="py-3 pr-4 text-right">上班次數</th>
              <th className="w-28 py-3 pr-4 text-right">工時</th>
              <th className="w-28 py-3 pr-4 text-right">時薪</th>
              <th className="w-32 py-3 pr-4 text-right">人工</th>
              <th className="py-3 pr-5 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) =>
              editing === a.id ? (
                <tr key={a.id} className="bg-ochre/10 align-top">
                  <td className="py-2.5 pl-5 pr-4 font-mono text-[12.5px]">{a.staffCode ?? "—"}</td>
                  <td className="py-2.5 pr-4">
                    <span className="font-semibold">{a.employeeName}</span>
                    <input className="underline-input mt-1.5 !py-1 text-[12.5px]" value={fNote} onChange={(e) => setFNote(e.target.value)} placeholder="修改原因（可留空）" />
                  </td>
                  <td className="py-2.5 pr-4 text-right font-mono">{a.shiftCount}</td>
                  <td className="py-2.5 pr-4 text-right">
                    <input className={cell} inputMode="decimal" value={fHours} onChange={(e) => setFHours(e.target.value)} aria-label="工時" />
                    <p className="mt-1 font-mono text-[10.5px] text-ink/45">打卡 {formatDuration(a.rawSeconds)}</p>
                  </td>
                  <td className="py-2.5 pr-4 text-right">
                    <input className={cell} inputMode="decimal" value={fRate} onChange={(e) => setFRate(e.target.value)} aria-label="時薪" />
                    {r < minWage && <p className="mt-1 font-mono text-[10.5px] text-red-800">⚠ 低過最低工資</p>}
                  </td>
                  <td className="py-2.5 pr-4 text-right">
                    <input className={cell} inputMode="decimal" value={fPay} onChange={(e) => setFPay(e.target.value)} placeholder={fmtMoney(autoPay)} aria-label="人工" />
                    <p className="mt-1 font-mono text-[10.5px] text-ink/45">{fPay.trim() ? `自動計係 $${fmtMoney(autoPay)}` : "留空 = 自動計"}</p>
                  </td>
                  <td className="py-2.5 pr-5 text-right">
                    <div className="flex justify-end gap-2">
                      <ActionButton tone="ghost" onClick={() => setEditing(null)}>
                        取消
                      </ActionButton>
                      <ActionButton tone="ochre" disabled={update.isPending} onClick={() => save(a.id)}>
                        儲存
                      </ActionButton>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={a.id} className="transition-colors hover:bg-ochre/10">
                  <td className="py-2.5 pl-5 pr-4 font-mono text-[12.5px]">{a.staffCode ?? "—"}</td>
                  <td className="py-2.5 pr-4">
                    {a.employeeName}
                    {a.editedAt && <span className="badge-frame ml-2 border border-ochre-deep font-mono text-[10px] text-ochre-deep">已手動修改</span>}
                    {a.note && <p className="font-mono text-[10.5px] text-ink/55">{a.note}</p>}
                    {a.period && <p className="font-mono text-[10.5px] text-ink/45">{a.period}</p>}
                  </td>
                  <td className="py-2.5 pr-4 text-right font-mono">{a.shiftCount}</td>
                  <td className="py-2.5 pr-4 text-right font-mono">
                    {Number(a.hours)}
                    <p className="text-[10.5px] text-ink/45">打卡 {formatDuration(a.rawSeconds)}</p>
                  </td>
                  <td className="py-2.5 pr-4 text-right font-mono">${Number(a.hourlyRate)}</td>
                  <td className="py-2.5 pr-4 text-right font-mono font-semibold">
                    ${fmtMoney(a.pay)}
                    {a.payOverride !== null && <p className="text-[10.5px] font-normal text-ochre-deep">手動金額</p>}
                  </td>
                  <td className="py-2.5 pr-5 text-right font-mono text-[11.5px]">
                    {a.locked ? (
                      <span className="text-ink/40">已出糧 · 鎖定</span>
                    ) : (
                      <>
                        <button onClick={() => startEdit(a)} className="px-2 py-1 text-ochre-deep underline-offset-2 hover:underline">
                          修改
                        </button>
                        <button
                          onClick={async () =>
                            (await askConfirm(`刪除 ${a.employeeName} ${month} 嘅考勤記錄？`, { danger: true, confirmLabel: "刪除" })) && del.mutate({ id: a.id })
                          }
                          className="px-2 py-1 text-red-800/80 underline-offset-2 hover:underline"
                        >
                          刪除
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ),
            )}
            {rows.length === 0 && <EmptyRow colSpan={7} text={list.isLoading ? "載入中…" : `${month} 未有匯入考勤；喺上面揀 CSV 檔匯入`} />}
          </tbody>
        </table>
      </div>
    </section>
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
      <p className="spec-label">Manual shifts</p>
      <h3 className="font-display mt-1 text-xl font-black tracking-tight">手動加更</h3>
      <p className="mb-4 mt-1.5 text-[13px] text-ink/60">考勤機冇記錄到嘅更（例如忘記打卡）先喺度補；已經喺考勤 CSV 嘅唔好重複加。</p>

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
            {rows.length === 0 && <EmptyRow colSpan={8} text={list.isLoading ? "載入中…" : `${month} 冇手動加更`} />}
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
  const [code, setCode] = useState("");
  const [phone, setPhone] = useState("");
  const [rate, setRate] = useState("");

  const create = trpc.payroll.createEmployee.useMutation({
    onSuccess: () => {
      toast.success("已新增員工");
      setName("");
      setCode("");
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
        className="grid gap-4 border border-ink/25 p-5 sm:grid-cols-2 lg:grid-cols-[.6fr_1.2fr_1fr_.8fr_auto] lg:items-end"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = Number(rate);
          if (!name.trim()) return toast.error("請輸入姓名");
          if (!rate.trim() || !Number.isFinite(r) || r < 0) return toast.error("請輸入時薪");
          if (r < minWage && !(await askConfirm(`時薪 $${r} 低過法定最低工資 $${minWage}，確定？`))) return;
          create.mutate({ name: name.trim(), staffCode: code.trim() || undefined, phone: phone || undefined, hourlyRate: r });
        }}
      >
        <Field label="工號">
          <input className="underline-input font-mono" value={code} onChange={(e) => setCode(e.target.value)} placeholder="107" />
        </Field>
        <Field label="姓名">
          <input className="underline-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="陳大文" />
        </Field>
        <Field label="電話">
          <input className="underline-input font-mono" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="可留空" />
        </Field>
        <Field label="時薪（港幣）">
          <input className="underline-input font-mono" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder={String(minWage || "")} />
        </Field>
        <ActionButton tone="ochre" disabled={create.isPending}>
          新增員工
        </ActionButton>
      </form>
      <p className="mt-2 font-mono text-[10.5px] leading-[1.8] text-ink/45">
        工號要同考勤機一樣（例如「107-Angel」嘅 107），匯入 CSV 先對得到。匯入時遇到新工號會自動新增員工。
      </p>

      <div className="mt-5 overflow-x-auto border border-ink/25">
        <table className="ledger-table w-full min-w-[680px] text-[13.5px]">
          <thead>
            <tr className="text-left">
              <th className="py-3 pl-5 pr-4">工號</th>
              <th className="py-3 pr-4">姓名</th>
              <th className="py-3 pr-4">電話</th>
              <th className="py-3 pr-4 text-right">時薪</th>
              <th className="py-3 pr-4">狀態</th>
              <th className="py-3 pr-5 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {(emps.data ?? []).map((e) => (
              <tr key={e.id} className={e.active ? "" : "text-ink/40"}>
                <td className="py-2.5 pl-5 pr-4 font-mono text-[12.5px]">
                  <button
                    className="underline-offset-2 hover:underline"
                    title="改工號"
                    onClick={async () => {
                      const v = await askPrompt(`${e.name} 嘅考勤機工號（留空 = 冇）`, e.staffCode ?? "");
                      if (v == null) return;
                      if (v.trim() && !/^\d{1,10}$/.test(v.trim())) return toast.error("工號只可以係數字");
                      update.mutate({ id: e.id, staffCode: v.trim() });
                    }}
                  >
                    {e.staffCode ?? "＋工號"}
                  </button>
                </td>
                <td className="py-2.5 pr-4 font-semibold">{e.name}</td>
                <td className="py-2.5 pr-4 font-mono text-[12.5px]">{e.phone ?? "—"}</td>
                <td className="py-2.5 pr-4 text-right font-mono">
                  ${Number(e.hourlyRate)}
                  {Number(e.hourlyRate) < minWage && <span className="ml-1 text-red-800">⚠</span>}
                </td>
                <td className="py-2.5 pr-4 font-mono text-[12px]">{e.active ? "在職" : "停用"}</td>
                <td className="py-2.5 pr-5 text-right font-mono text-[11.5px]">
                  <button
                    className="px-2 py-1 text-ochre-deep underline-offset-2 hover:underline"
                    onClick={async () => {
                      const v = await askPrompt(`${e.name} 嘅新時薪（只影響之後匯入嘅考勤同新加嘅更）`, String(Number(e.hourlyRate)));
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
