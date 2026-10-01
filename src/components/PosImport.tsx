import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { fmtMoney } from "@/lib/format";
import { ActionButton } from "@/pages/admin/ui";

/** 判斷係咪 POS「商品銷售_明細」原檔 */
export function isPosCsv(text: string) {
  return /商品銷售_明細/.test(text.slice(0, 400)) || /(^|\n)\s*行號\s*,.*商品名稱/.test(text.slice(0, 2000));
}

/** 由標題行讀銷售期間；預設記帳日期 = 結束日前一日（POS 結束時間係翌日朝早 10:00） */
function readPeriod(text: string) {
  const m = text.slice(0, 400).match(/(\d{4}-\d{2}-\d{2})\s*[\d-]*\s*至\s*(\d{4}-\d{2}-\d{2})/);
  if (!m) return null;
  const d = new Date(m[2] + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  const last = d.toISOString().slice(0, 10);
  return { start: m[1], end: m[2], defaultDate: last < m[1] ? m[1] : last };
}

type Summary = {
  inserted: number;
  count: number;
  directCount: number;
  skippedRent: number;
  totalQty: number;
  totalAmount: string;
  saleDate: string;
  byGrid: { code: string; tenantName: string | null; count: number; qty: number; amount: string }[];
  warnings: string[];
  errors: { row: number; message: string }[];
};

/**
 * POS 檔匯入：揀檔 → 預覽（每格筆數、金額、警告）→ 確認匯入。
 * 格仔由每行「商品分類」（例如「04格」）自動判斷；冇格號 = 店舖直銷；租金／按金自動略過。
 */
export function PosImport({ text, fileName, onCancel, onDone }: { text: string; fileName: string; onCancel: () => void; onDone: () => void }) {
  const period = readPeriod(text);
  const [saleDate, setSaleDate] = useState(period?.defaultDate ?? new Date().toISOString().slice(0, 10));
  const [preview, setPreview] = useState<Summary | null>(null);
  const [done, setDone] = useState<Summary | null>(null);

  const run = trpc.shop.admin.importPosSales.useMutation({
    onError: (e) => toast.error(e.message),
  });

  const doPreview = () =>
    run.mutate({ csvText: text, saleDate, dryRun: true }, { onSuccess: (r) => setPreview(r) });
  const doImport = () =>
    run.mutate(
      { csvText: text, saleDate, dryRun: false },
      {
        onSuccess: (r) => {
          setDone(r);
          toast.success(`成功匯入 ${r.inserted} 筆 POS 銷售`);
          onDone();
        },
      },
    );

  const s = done ?? preview;

  return (
    <div className="mt-5 border-t border-ink/15 pt-5">
      <p className="font-mono text-[12px] text-ink/70">
        已認出 POS「商品銷售_明細」檔：<b>{fileName}</b>
        {period && (
          <>
            <br />
            檔案期間：{period.start} 至 {period.end}
          </>
        )}
      </p>

      {!done && (
        <div className="mt-4 flex flex-wrap items-end gap-4">
          <label className="block">
            <span className="spec-label mb-1.5 block">記帳日期（POS 檔冇逐日日期）</span>
            <input
              type="date"
              className="border border-ink/30 bg-cream px-3 py-2 font-mono text-[13.5px] outline-none focus:border-ink"
              value={saleDate}
              onChange={(e) => {
                setSaleDate(e.target.value);
                setPreview(null);
              }}
            />
          </label>
          {!preview ? (
            <ActionButton tone="ochre" disabled={!saleDate || run.isPending} onClick={doPreview}>
              {run.isPending ? "分析中…" : "預覽"}
            </ActionButton>
          ) : (
            <ActionButton tone="ochre" disabled={run.isPending || preview.count === 0} onClick={doImport}>
              {run.isPending ? "匯入中…" : `確認匯入 ${preview.count} 筆`}
            </ActionButton>
          )}
          <ActionButton tone="ghost" disabled={run.isPending} onClick={onCancel}>
            取消
          </ActionButton>
        </div>
      )}

      {s && (
        <div className="mt-5 font-mono text-[12px] leading-[1.9]">
          <p className="text-ink">
            {done ? "✓ 已匯入" : "預覽："} {s.count} 筆 · 數量 {s.totalQty} · 金額 ${fmtMoney(s.totalAmount)} · 記帳日期 {s.saleDate}
          </p>
          <p className="text-ink/55">
            其中店舖直銷 {s.directCount} 筆{s.skippedRent ? ` · 已略過租金／按金 ${s.skippedRent} 行（唔係銷售）` : ""}
          </p>
          <div className="mt-3 overflow-x-auto border border-ink/20">
            <table className="ledger-table w-full min-w-[420px] text-[12.5px]">
              <thead>
                <tr className="text-left">
                  <th className="py-2 pl-4 pr-3">格仔</th>
                  <th className="py-2 pr-3">租戶</th>
                  <th className="py-2 pr-3 text-right">筆數</th>
                  <th className="py-2 pr-3 text-right">數量</th>
                  <th className="py-2 pr-4 text-right">金額</th>
                </tr>
              </thead>
              <tbody>
                {s.byGrid.map((g) => (
                  <tr key={g.code}>
                    <td className="py-1.5 pl-4 pr-3 font-semibold">{g.code}</td>
                    <td className="py-1.5 pr-3">{g.code === "店舖直銷" ? "—" : g.tenantName ?? <span className="text-ochre-deep">未有租約</span>}</td>
                    <td className="py-1.5 pr-3 text-right">{g.count}</td>
                    <td className="py-1.5 pr-3 text-right">{g.qty}</td>
                    <td className="py-1.5 pr-4 text-right">${fmtMoney(g.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {s.warnings.map((w, i) => (
            <p key={i} className="text-ochre-deep">⚠ {w}</p>
          ))}
          {s.errors.slice(0, 10).map((er, i) => (
            <p key={i} className="text-red-800/80">✗ 第 {er.row} 行：{er.message}</p>
          ))}
          {done && (
            <div className="mt-3">
              <ActionButton tone="ghost" onClick={onCancel}>
                完成
              </ActionButton>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
