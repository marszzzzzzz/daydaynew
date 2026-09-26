import { useRef, useState } from "react";
import { trpc } from "@/providers/trpc";
import { toast } from "sonner";
import { SectionTitle, ActionButton } from "../ui";
import { parseCsv, downloadCsv } from "@/lib/csv";

const EXPORTERS = [
  { dataset: "sales", label: "銷售記錄", file: "sales.csv" },
  { dataset: "grids", label: "格仔資料", file: "grids.csv" },
  { dataset: "leases", label: "租約資料", file: "leases.csv" },
  { dataset: "rent", label: "租金按金", file: "rent_records.csv" },
  { dataset: "tenants", label: "租戶名單", file: "tenants.csv" },
] as const;

export default function CsvTab() {
  const utils = trpc.useUtils();
  const exportCsv = trpc.shop.admin.exportCsv.useMutation({
    onSuccess: (r) => {
      downloadCsv(r.filename, r.csv);
      toast.success(`已匯出 ${r.filename}`);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div>
      <SectionTitle
        no="07 · CSV"
        title="匯入及匯出 CSV"
        desc="匯出嘅 CSV 以 UTF-8 編碼（含 BOM），可直接用 Excel 開啟。匯入時請跟指定欄位次序。"
      />

      {/* 匯出 */}
      <h3 className="font-display mb-5 text-xl font-black tracking-tight">匯出</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {EXPORTERS.map((e) => (
          <button
            key={e.dataset}
            onClick={() => exportCsv.mutate({ dataset: e.dataset })}
            disabled={exportCsv.isPending}
            className="group border border-ink/25 p-5 text-left transition-all hover:-translate-y-0.5 hover:border-ink hover:shadow-[4px_4px_0_0_rgba(29,29,29,0.9)] disabled:opacity-40"
          >
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ochre-deep">CSV ↓</p>
            <p className="font-display mt-2 text-lg font-bold">{e.label}</p>
            <p className="mt-1 font-mono text-[11px] text-ink/45">{e.file}</p>
          </button>
        ))}
      </div>

      <hr className="dotline my-14" />

      {/* 匯入 */}
      <h3 className="font-display mb-5 text-xl font-black tracking-tight">匯入</h3>
      <div className="grid gap-8 lg:grid-cols-2">
        <ImportSales
          onDone={() => {
            utils.shop.admin.listSales.invalidate();
            utils.shop.admin.stats.invalidate();
          }}
        />
        <ImportGrids
          onDone={() => {
            utils.shop.admin.listGrids.invalidate();
            utils.shop.admin.stats.invalidate();
            utils.shop.publicGridWall.invalidate();
          }}
        />
        <ImportPosSales
          onDone={() => {
            utils.shop.admin.listSales.invalidate();
            utils.shop.admin.stats.invalidate();
          }}
        />
      </div>
    </div>
  );
}

/** POS 收銀系統「商品銷售_明細」CSV 直接匯入（Day Day New 格式） */
function ImportPosSales({ onDone }: { onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [gridId, setGridId] = useState<number | null>(null);
  const [saleDate, setSaleDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [fileName, setFileName] = useState("");
  const [csvText, setCsvText] = useState("");
  const [result, setResult] = useState<{
    inserted: number;
    totalQty: number;
    totalAmount: string;
    period: { start: string; end: string } | null;
    gridCode: string;
    tenantName: string | null;
    errors: { row: number; message: string }[];
  } | null>(null);

  const gridsQ = trpc.shop.admin.listGrids.useQuery();
  const occupied = (gridsQ.data ?? []).filter((g) => g.status === "occupied");

  const importPos = trpc.shop.admin.importPosSales.useMutation({
    onSuccess: (r) => {
      setResult(r);
      if (r.inserted > 0) {
        toast.success(`成功匯入 ${r.inserted} 筆 POS 銷售到 ${r.gridCode}`);
        onDone();
      }
      if (r.errors.length > 0) toast.error(`${r.errors.length} 行有錯誤`);
    },
    onError: (e) => toast.error(e.message),
  });

  const handleFile = async (file: File) => {
    const text = await file.text();
    if (!text.includes("商品名稱")) {
      setCsvText("");
      setFileName("");
      return toast.error("呢個檔案唔似「商品銷售_明細」格式（搵唔到欄位標題）");
    }
    setCsvText(text);
    setFileName(file.name);
    setResult(null);
  };

  return (
    <div className="border border-ink/25 p-6 lg:col-span-2">
      <p className="spec-label">Import — POS 收銀明細（Day Day New）</p>
      <p className="mt-3 font-mono text-[11.5px] leading-[1.9] text-ink/60">
        直接上傳收銀系統匯出嘅「商品銷售_明細」CSV，系統自動跳過標題同「合計」行，
        抽取商品名稱、數量、銷售金額（單價 = 金額 ÷ 數量）。
        <br />
        由於 POS 檔冇格號同每日日期，請揀返呢批銷售屬於邊個格仔、記落邊一日。
      </p>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <label className="block">
          <span className="spec-label mb-1.5 block">所屬格仔（須有生效租約）</span>
          <select
            className="w-full border border-ink/30 bg-cream px-3 py-2.5 font-mono text-[13.5px] outline-none focus:border-ink"
            value={gridId ?? ""}
            onChange={(e) => setGridId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">— 揀格仔 —</option>
            {occupied.map((g) => (
              <option key={g.id} value={g.id}>
                {g.code} · {g.size === "L" ? "大格" : "中格"}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="spec-label mb-1.5 block">記帳日期</span>
          <input
            type="date"
            className="w-full border border-ink/30 bg-cream px-3 py-2.5 font-mono text-[13.5px] outline-none focus:border-ink"
            value={saleDate}
            onChange={(e) => setSaleDate(e.target.value)}
          />
        </label>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-4">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
            e.target.value = "";
          }}
        />
        <ActionButton tone="ghost" onClick={() => fileRef.current?.click()}>
          {csvText ? "重新選擇檔案" : "① 選擇 POS CSV 檔案"}
        </ActionButton>
        {fileName && <span className="font-mono text-[12px] text-ink/60">{fileName}</span>}
        <ActionButton
          tone="ochre"
          disabled={!csvText || !gridId || !saleDate || importPos.isPending}
          onClick={() => csvText && gridId && importPos.mutate({ gridId, saleDate, csvText })}
        >
          {importPos.isPending ? "匯入中…" : "② 匯入"}
        </ActionButton>
      </div>

      {result && (
        <div className="mt-5 border-t border-ink/15 pt-4 font-mono text-[12px] leading-[1.9]">
          <p className="text-ink">
            ✓ 匯入 {result.inserted} 筆到 {result.gridCode}
            {result.tenantName ? `（租戶：${result.tenantName}）` : ""} · 總數量 {result.totalQty} · 總金額 $
            {result.totalAmount}
          </p>
          {result.period && (
            <p className="text-ink/55">檔案標示期間：{result.period.start} 至 {result.period.end}</p>
          )}
          {result.errors.slice(0, 8).map((er, i) => (
            <p key={i} className="text-red-800/80">第 {er.row} 行：{er.message}</p>
          ))}
        </div>
      )}
    </div>
  );
}

function ImportSales({ onDone }: { onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<{ inserted: number; directCount: number; errors: { row: number; message: string }[] } | null>(null);

  const importSales = trpc.shop.admin.importSales.useMutation({
    onSuccess: (r) => {
      setResult(r);
      if (r.inserted > 0) {
        toast.success(`成功匯入 ${r.inserted} 筆銷售${r.directCount > 0 ? `（含 ${r.directCount} 筆店舖直銷）` : ""}`);
        onDone();
      }
      if (r.errors.length > 0) toast.error(`${r.errors.length} 行有錯誤`);
    },
    onError: (e) => toast.error(e.message),
  });

  const handleFile = async (file: File) => {
    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length < 2) return toast.error("CSV 內容為空");
    const body = rows.slice(1).map((r) => ({
      saleDate: (r[0] ?? "").trim(),
      saleTime: (r[1] ?? "").trim(),
      gridCode: (r[2] ?? "").trim(),
      productName: (r[3] ?? "").trim(),
      quantity: (r[4] ?? "").trim(),
      unitPrice: (r[5] ?? "").trim(),
      note: (r[6] ?? "").trim(),
    }));
    importSales.mutate({ rows: body });
  };

  return (
    <div className="border border-ink/25 p-6">
      <p className="spec-label">Import — 銷售記錄（標準格式）</p>
      <p className="mt-3 font-mono text-[11.5px] leading-[1.9] text-ink/60">
        欄位次序：交易日期, 交易時間, 格仔編號, 商品名稱, 數量, 單價, 備註
        <br />
        例：2026-07-01, 14:30, 024, PKM散M4, 3, 125, 可留空
        <br />
        格仔編號留空 = 店舖直銷；銷售金額 = 數量 × 單價，系統自動計
      </p>
      <div className="mt-5 flex items-center gap-4">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
        <ActionButton tone="ochre" disabled={importSales.isPending} onClick={() => fileRef.current?.click()}>
          {importSales.isPending ? "匯入中…" : "選擇 CSV 檔案"}
        </ActionButton>
      </div>
      {result && (
        <div className="mt-5 font-mono text-[12px] leading-[1.9]">
          <p className="text-ink">
            ✓ 成功 {result.inserted} 筆{result.directCount > 0 ? `（含 ${result.directCount} 筆店舖直銷）` : ""} · ✗ 錯誤 {result.errors.length} 行
          </p>
          {result.errors.slice(0, 8).map((er, i) => (
            <p key={i} className="text-red-800/80">第 {er.row} 行：{er.message}</p>
          ))}
        </div>
      )}
    </div>
  );
}

function ImportGrids({ onDone }: { onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<{ inserted: number; errors: { row: number; message: string }[] } | null>(null);

  const importGrids = trpc.shop.admin.importGrids.useMutation({
    onSuccess: (r) => {
      setResult(r);
      if (r.inserted > 0) {
        toast.success(`成功匯入 ${r.inserted} 個格仔`);
        onDone();
      }
      if (r.errors.length > 0) toast.error(`${r.errors.length} 行有錯誤`);
    },
    onError: (e) => toast.error(e.message),
  });

  const handleFile = async (file: File) => {
    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length < 2) return toast.error("CSV 內容為空");
    const body = rows.slice(1).map((r) => ({
      code: (r[0] ?? "").trim(),
      size: (r[1] ?? "").trim(),
      monthlyRent: (r[2] ?? "").trim(),
    }));
    importGrids.mutate({ rows: body });
  };

  return (
    <div className="border border-ink/25 p-6">
      <p className="spec-label">Import — 格仔資料</p>
      <p className="mt-3 font-mono text-[11.5px] leading-[1.9] text-ink/60">
        欄位次序：code, size, monthlyRent
        <br />
        例：024, M, 500（size 只接受 M / L）
      </p>
      <div className="mt-5 flex items-center gap-4">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
        <ActionButton tone="ochre" disabled={importGrids.isPending} onClick={() => fileRef.current?.click()}>
          {importGrids.isPending ? "匯入中…" : "選擇 CSV 檔案"}
        </ActionButton>
      </div>
      {result && (
        <div className="mt-5 font-mono text-[12px] leading-[1.9]">
          <p className="text-ink">✓ 成功 {result.inserted} 格 · ✗ 錯誤 {result.errors.length} 行</p>
          {result.errors.slice(0, 8).map((er, i) => (
            <p key={i} className="text-red-800/80">第 {er.row} 行：{er.message}</p>
          ))}
        </div>
      )}
    </div>
  );
}
