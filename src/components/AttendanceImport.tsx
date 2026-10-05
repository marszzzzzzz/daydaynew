import { useRef, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { fmtMoney } from "@/lib/format";
import { ActionButton } from "@/pages/admin/ui";
import { parseAttendanceCsv, formatDuration } from "@contracts/attendance";
import { shiftPay } from "@contracts/payroll";

type Preview = {
  month: string;
  period: string | null;
  keptOthers: number;
  imported: number;
  created: number;
  skipped: number;
  total: { hours: number; pay: number };
  rows: {
    key: string;
    line: number;
    code: string;
    name: string;
    shiftCount: number;
    seconds: number;
    hours: number;
    employeeId: number | null;
    employeeName: string | null;
    matchedBy: "code" | "name" | null;
    hourlyRate: number | null;
    pay: number | null;
    status: "new" | "locked" | "replace" | "create";
    previous: { hours: number; pay: number } | null;
    manualShifts: number;
    belowMinWage: boolean;
  }[];
};

const STATUS: Record<Preview["rows"][number]["status"], { label: string; cls: string }> = {
  create: { label: "新增", cls: "border-ink/50" },
  replace: { label: "覆蓋舊記錄", cls: "border-ochre-deep text-ochre-deep" },
  new: { label: "新員工", cls: "border-ochre-deep bg-ochre/15" },
  locked: { label: "已出糧 · 跳過", cls: "border-ink/30 text-ink/45" },
};

/**
 * 考勤機「員工考勤_明細」CSV 匯入：揀檔 → 預覽（對應員工、工時、人工）→ 確認匯入。
 * 每人每月一條總工時；人工 = 工時 × 時薪。同月再匯入會覆蓋，唔會重複計。
 */
export default function AttendanceImport({ month, minWage, onImported }: { month: string; minWage: number; onImported: (month: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [targetMonth, setTargetMonth] = useState(month);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [done, setDone] = useState<Preview | null>(null);
  const [rates, setRates] = useState<Record<string, string>>({});
  const [fillAll, setFillAll] = useState("");

  const utils = trpc.useUtils();
  const run = trpc.payroll.importAttendance.useMutation({ onError: (e) => toast.error(e.message) });

  const reset = () => {
    setFile(null);
    setErrors([]);
    setPreview(null);
    setDone(null);
    setRates({});
    setFillAll("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const loadPreview = (text: string, m: string) =>
    run.mutate({ csvText: text, month: m, dryRun: true }, { onSuccess: (r) => setPreview(r) });

  const onFile = async (f: File) => {
    reset();
    const text = await f.text();
    const parsed = parseAttendanceCsv(text);
    setFile({ name: f.name, text });
    if (parsed.errors.length) return setErrors(parsed.errors);
    const m = parsed.month ?? month;
    setTargetMonth(m);
    loadPreview(text, m);
  };

  const newRows = preview?.rows.filter((r) => r.status === "new") ?? [];
  const rateOf = (r: Preview["rows"][number]) => {
    if (r.status !== "new") return r.hourlyRate;
    const v = Number(rates[r.key]);
    return rates[r.key]?.trim() && Number.isFinite(v) && v >= 0 ? v : null;
  };
  const missingRate = newRows.some((r) => rateOf(r) === null);
  const total = preview?.rows.reduce((a, r) => a + (r.status === "locked" ? 0 : shiftPay(r.hours, rateOf(r) ?? 0)), 0) ?? 0;
  const importable = preview?.rows.filter((r) => r.status !== "locked").length ?? 0;

  const doImport = () => {
    if (!file || !preview) return;
    const newRates: Record<string, number> = {};
    for (const r of newRows) newRates[r.key] = rateOf(r)!;
    run.mutate(
      { csvText: file.text, month: targetMonth, newRates, dryRun: false },
      {
        onSuccess: (r) => {
          setDone(r);
          setPreview(null);
          toast.success(`已匯入 ${r.imported} 位員工嘅考勤${r.created ? `（新增 ${r.created} 位員工）` : ""}`);
          void utils.payroll.invalidate();
          onImported(r.month);
        },
      },
    );
  };

  const shown = done ?? preview;

  return (
    <section className="border border-ink/25 p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="spec-label">Attendance import</p>
          <h3 className="font-display mt-1 text-xl font-black tracking-tight">匯入考勤機 CSV</h3>
          <p className="mt-1.5 max-w-xl text-[13px] leading-[1.8] text-ink/60">
            揀考勤機匯出嘅「員工考勤_明細」CSV，系統會按工號對應員工，自動記錄當月工時同計人工。同一個月再匯入會覆蓋舊數字。
          </p>
        </div>
        <div className="flex gap-2">
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          <ActionButton tone="ochre" disabled={run.isPending} onClick={() => fileRef.current?.click()}>
            {file ? "揀另一個檔" : "揀 CSV 檔"}
          </ActionButton>
          {file && (
            <ActionButton tone="ghost" disabled={run.isPending} onClick={reset}>
              {done ? "完成" : "取消"}
            </ActionButton>
          )}
        </div>
      </div>

      {file && (
        <p className="mt-4 font-mono text-[12px] text-ink/70">
          檔案：<b>{file.name}</b>
          {shown?.period && <> · 考勤期間 {shown.period}</>}
        </p>
      )}

      {errors.length > 0 && (
        <div className="mt-3 border border-red-800/40 bg-red-800/5 p-3 font-mono text-[12px] leading-[1.9] text-red-800">
          <p className="font-semibold">呢個檔唔可以匯入：</p>
          {errors.slice(0, 8).map((e, i) => (
            <p key={i}>✗ {e}</p>
          ))}
        </div>
      )}

      {preview && !done && (
        <div className="mt-4 flex flex-wrap items-end gap-4">
          <label className="block">
            <span className="spec-label mb-1.5 block">記入月份</span>
            <input
              type="month"
              className="border border-ink/30 bg-cream px-3 py-2 font-mono text-[13.5px] outline-none focus:border-ink"
              value={targetMonth}
              onChange={(e) => {
                if (!e.target.value || !file) return;
                setTargetMonth(e.target.value);
                loadPreview(file.text, e.target.value);
              }}
            />
          </label>
          {newRows.length > 1 && (
            <label className="block">
              <span className="spec-label mb-1.5 block">新員工時薪一次過填</span>
              <span className="flex gap-2">
                <input
                  className="w-24 border border-ink/30 bg-cream px-3 py-2 font-mono text-[13.5px] outline-none focus:border-ink"
                  inputMode="decimal"
                  value={fillAll}
                  onChange={(e) => setFillAll(e.target.value)}
                  placeholder={String(minWage)}
                />
                <ActionButton tone="ghost" onClick={() => setRates(Object.fromEntries(newRows.map((r) => [r.key, fillAll])))}>
                  全部套用
                </ActionButton>
              </span>
            </label>
          )}
          <ActionButton tone="ochre" disabled={run.isPending || missingRate || importable === 0} onClick={doImport}>
            {run.isPending ? "處理中…" : `確認匯入 ${importable} 位 · $${fmtMoney(total)}`}
          </ActionButton>
          {missingRate && <span className="font-mono text-[11.5px] text-ochre-deep">請先填新員工嘅時薪</span>}
        </div>
      )}

      {shown && (
        <div className="mt-5">
          {done && (
            <p className="mb-3 font-mono text-[12.5px] text-ink">
              ✓ 已匯入 {done.month}：{done.imported} 位員工
              {done.created ? ` · 新增員工 ${done.created} 位` : ""}
              {done.skipped ? ` · 已出糧跳過 ${done.skipped} 位` : ""}。下面「月結」已經更新。
            </p>
          )}
          <div className="overflow-x-auto border border-ink/20">
            <table className="ledger-table w-full min-w-[760px] text-[13px]">
              <thead>
                <tr className="text-left">
                  <th className="py-2.5 pl-4 pr-3">工號</th>
                  <th className="py-2.5 pr-3">員工</th>
                  <th className="py-2.5 pr-3 text-right">上班次數</th>
                  <th className="py-2.5 pr-3 text-right">工時</th>
                  <th className="py-2.5 pr-3 text-right">時薪</th>
                  <th className="py-2.5 pr-3 text-right">人工</th>
                  <th className="py-2.5 pr-4 text-right">狀態</th>
                </tr>
              </thead>
              <tbody>
                {shown.rows.map((r) => {
                  const rate = done ? r.hourlyRate : rateOf(r);
                  return (
                    <tr key={r.key} className={r.status === "locked" ? "text-ink/45" : ""}>
                      <td className="py-2 pl-4 pr-3 font-mono">{r.code || "—"}</td>
                      <td className="py-2 pr-3">
                        <span className="font-semibold">{r.employeeName ?? r.name}</span>
                        {r.matchedBy === "name" && r.code && <p className="font-mono text-[10.5px] text-ink/50">按名對應，會記低工號 {r.code}</p>}
                        {r.manualShifts > 0 && r.status !== "locked" && (
                          <p className="font-mono text-[10.5px] text-ochre-deep">⚠ 呢個月仲有 {r.manualShifts} 更手動記錄，會一齊計；如重複請刪除</p>
                        )}
                        {r.previous && r.status === "replace" && (
                          <p className="font-mono text-[10.5px] text-ink/50">
                            舊記錄 {r.previous.hours} 小時 / ${fmtMoney(r.previous.pay)}
                          </p>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right font-mono">{r.shiftCount}</td>
                      <td className="py-2 pr-3 text-right font-mono">
                        {r.hours}
                        <p className="text-[10.5px] text-ink/45">{formatDuration(r.seconds)}</p>
                      </td>
                      <td className="py-2 pr-3 text-right font-mono">
                        {r.status === "new" && !done ? (
                          <input
                            className="w-20 border border-ochre-deep/60 bg-cream px-2 py-1 text-right font-mono text-[13px] outline-none focus:border-ink"
                            inputMode="decimal"
                            value={rates[r.key] ?? ""}
                            onChange={(e) => setRates((x) => ({ ...x, [r.key]: e.target.value }))}
                            placeholder="時薪"
                            aria-label={`${r.name} 時薪`}
                          />
                        ) : rate !== null ? (
                          `$${rate}`
                        ) : (
                          "—"
                        )}
                        {rate !== null && rate < minWage && <p className="text-[10.5px] text-red-800">⚠ 低過最低工資</p>}
                      </td>
                      <td className="py-2 pr-3 text-right font-mono font-semibold">{rate !== null ? `$${fmtMoney(shiftPay(r.hours, rate))}` : "—"}</td>
                      <td className="py-2 pr-4 text-right">
                        <span className={`badge-frame border font-mono text-[10.5px] ${STATUS[r.status].cls}`}>{done && r.status !== "locked" ? "已匯入" : STATUS[r.status].label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 font-mono text-[10.5px] leading-[1.8] text-ink/45">
            工時已經核對檔案「合計」行。人工 = 工時（小時，2 位小數）× 時薪。
            {shown.keptOthers > 0 && ` 呢個月另有 ${shown.keptOthers} 位員工嘅考勤唔喺呢個檔，會保留唔變。`}
          </p>
        </div>
      )}
    </section>
  );
}
