import { useMemo, useRef, useState } from "react";
import { trpc } from "@/providers/trpc";
import { toast } from "sonner";
import DashHeader from "@/components/DashHeader";
import WeeklyReport from "@/components/WeeklyReport";
import { fmtMoney, todayStr } from "@/lib/format";
import { parseCsv } from "@/lib/csv";
import { PosImport, isPosCsv } from "@/components/PosImport";
import { useAuth } from "@/hooks/useAuth";
import { Field, ActionButton, EmptyRow } from "./admin/ui";

/**
 * 店員專區（/staff）：
 * 記錄銷售（含店舖直銷）、上載標準格式 CSV、修改／刪除自己輸入嘅記錄、查看週結報表。
 * 店員唔可以管理格仔、租約、租金、租戶，亦唔可以改人哋嘅記錄。
 */
export default function StaffDashboard() {
  const { user, isLoading } = useAuth({ redirectOnUnauthenticated: true });
  const [tab, setTab] = useState<"entry" | "mine" | "csv" | "weekly">("entry");

  if (isLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream">
        <p className="font-mono text-[12px] uppercase tracking-[0.22em] text-ink/50">載入中…</p>
      </div>
    );
  }

  const TABS = [
    { id: "entry" as const, no: "01", label: "記錄銷售" },
    { id: "mine" as const, no: "02", label: "我嘅記錄" },
    { id: "csv" as const, no: "03", label: "上載 CSV" },
    { id: "weekly" as const, no: "04", label: "週結報表" },
  ];

  return (
    <div className="min-h-screen bg-cream text-ink">
      <DashHeader roleLabel="店員 Staff" />
      <main className="mx-auto max-w-6xl px-5 py-10">
        <p className="spec-label">Staff — 店員專區</p>
        <h1 className="font-display mt-2 text-4xl font-black tracking-tight">你好，{user.name ?? "店員"}</h1>
        <p className="mt-3 max-w-xl text-[13.5px] leading-[1.85] text-ink/60">
          你可以上載同記錄銷售數據、修改自己輸入嘅記錄、查看報表。格仔、租約、租金同租戶管理由店主負責。
        </p>

        <nav className="mt-8 flex flex-wrap gap-x-8 gap-y-3 border-b border-ink/20 pb-px">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`group relative pb-3 text-[13.5px] tracking-wide transition-colors ${tab === t.id ? "font-semibold text-ink" : "text-ink/45 hover:text-ink"}`}
            >
              <span className="mr-2 font-mono text-[10.5px] text-ochre-deep">{t.no}</span>
              {t.label}
              <span className={`absolute -bottom-px left-0 h-[2px] bg-ink transition-all ${tab === t.id ? "w-full" : "w-0 group-hover:w-1/2"}`} />
            </button>
          ))}
        </nav>

        <div className="mt-10">
          {tab === "entry" && <SaleEntry />}
          {tab === "mine" && <MySales userId={user.id} />}
          {tab === "csv" && <CsvUpload />}
          {tab === "weekly" && <WeeklyReport />}
        </div>
      </main>
    </div>
  );
}

/** 01 記錄銷售 */
function SaleEntry() {
  const utils = trpc.useUtils();
  const grids = trpc.shop.admin.listGrids.useQuery();
  const occupiedGrids = useMemo(() => (grids.data ?? []).filter((g) => g.status === "occupied"), [grids.data]);

  const [fDate, setFDate] = useState(todayStr());
  const [fTime, setFTime] = useState("");
  const [fGrid, setFGrid] = useState<number | "direct" | "">("");
  const [fProduct, setFProduct] = useState("");
  const [fQty, setFQty] = useState("1");
  const [fPrice, setFPrice] = useState("");
  const [fNote, setFNote] = useState("");

  const create = trpc.shop.admin.createSale.useMutation({
    onSuccess: () => {
      toast.success("銷售已記錄");
      setFProduct("");
      setFQty("1");
      setFPrice("");
      setFNote("");
      utils.shop.admin.listSales.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <form
      className="grid gap-5 border border-ink/25 p-6 md:grid-cols-[140px_110px_130px_1fr_80px_100px_auto] md:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        const qty = parseInt(fQty, 10);
        const price = Number(fPrice);
        if (!fGrid) return toast.error("請揀格仔或「店舖直銷」");
        if (!fProduct.trim()) return toast.error("請輸入貨品名稱");
        if (!Number.isFinite(qty) || qty < 1) return toast.error("數量錯誤");
        if (!Number.isFinite(price) || price < 0) return toast.error("單價錯誤");
        create.mutate({
          gridId: fGrid === "direct" ? null : Number(fGrid),
          saleDate: fDate,
          saleTime: fTime || undefined,
          productName: fProduct.trim(),
          quantity: qty,
          unitPrice: price,
          note: fNote || undefined,
        });
      }}
    >
      <Field label="售出日期">
        <input type="date" className="underline-input font-mono" value={fDate} max={todayStr()} onChange={(e) => setFDate(e.target.value)} />
      </Field>
      <Field label="時間（可留空）">
        <input type="time" className="underline-input font-mono" value={fTime} onChange={(e) => setFTime(e.target.value)} />
      </Field>
      <Field label="格仔">
        <select className="underline-input w-full bg-transparent font-mono" value={fGrid} onChange={(e) => setFGrid(e.target.value === "direct" ? "direct" : e.target.value ? Number(e.target.value) : "")}>
          <option value="">揀格仔</option>
          <option value="direct">— 店舖直銷 —</option>
          {occupiedGrids.map((g) => (
            <option key={g.id} value={g.id}>{g.code}</option>
          ))}
        </select>
      </Field>
      <Field label="貨品名稱">
        <input className="underline-input" value={fProduct} onChange={(e) => setFProduct(e.target.value)} placeholder="手繪耳環" />
      </Field>
      <Field label="數量">
        <input className="underline-input font-mono" value={fQty} onChange={(e) => setFQty(e.target.value)} inputMode="numeric" />
      </Field>
      <Field label="單價 HKD">
        <input className="underline-input font-mono" value={fPrice} onChange={(e) => setFPrice(e.target.value)} placeholder="88" inputMode="decimal" />
      </Field>
      <ActionButton tone="ochre" disabled={create.isPending}>{create.isPending ? "記錄中…" : "+ 記錄"}</ActionButton>
      <div className="md:col-span-full">
        <Field label="備註（可留空）">
          <input className="underline-input" value={fNote} onChange={(e) => setFNote(e.target.value)} placeholder="例如：客人議價、預留交收" />
        </Field>
      </div>
    </form>
  );
}

/** 02 我嘅記錄（只係自己輸入嘅，可以改／刪） */
function MySales({ userId }: { userId: number }) {
  const utils = trpc.useUtils();
  // 由伺服器直接篩選自己嘅記錄（唔會因為全店頭 500 筆限制而漏咗）
  const sales = trpc.shop.admin.listSales.useQuery({ mine: true });
  const mine = useMemo(() => (sales.data ?? []).filter((r) => r.createdBy === userId), [sales.data, userId]);

  const invalidate = () => {
    utils.shop.admin.listSales.invalidate();
  };

  const del = trpc.shop.admin.deleteSale.useMutation({
    onSuccess: () => {
      toast.success("已刪除");
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div>
      <p className="mb-5 font-mono text-[12px] text-ink/55">
        只顯示由你輸入嘅記錄（共 {mine.length} 筆）。店主可以修改所有記錄；你只可以改自己嘅。
      </p>
      <div className="overflow-x-auto border border-ink/25">
        <table className="ledger-table w-full min-w-[720px] text-[13.5px]">
          <thead>
            <tr className="text-left">
              <th className="py-3 pl-5 pr-4">日期時間</th>
              <th className="py-3 pr-4">格仔</th>
              <th className="py-3 pr-4">貨品</th>
              <th className="py-3 pr-4 text-right">數量</th>
              <th className="py-3 pr-4 text-right">單價</th>
              <th className="py-3 pr-4 text-right">金額</th>
              <th className="py-3 pr-5 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {mine.map((r) => (
              <MySaleRow key={r.id} row={r} onDelete={() => { if (confirm("確定刪除呢筆記錄？")) del.mutate({ id: r.id }); }} onSaved={invalidate} />
            ))}
            {mine.length === 0 && <EmptyRow colSpan={7} text={sales.isLoading ? "載入中…" : "你仲未輸入任何記錄"} />}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type SaleRowData = {
  id: number;
  saleDate: string;
  saleTime: string | null;
  gridCode: string | null;
  tenantName: string | null;
  productName: string;
  quantity: number;
  unitPrice: string;
  totalAmount: string;
  note: string | null;
};

function MySaleRow({ row, onDelete, onSaved }: { row: SaleRowData; onDelete: () => void; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [product, setProduct] = useState(row.productName);
  const [qty, setQty] = useState(String(row.quantity));
  const [price, setPrice] = useState(String(Number(row.unitPrice)));
  const [note, setNote] = useState(row.note ?? "");

  const update = trpc.shop.admin.updateSale.useMutation({
    onSuccess: () => {
      toast.success("已更新");
      setEditing(false);
      onSaved();
    },
    onError: (e) => toast.error(e.message),
  });

  if (editing) {
    return (
      <tr className="bg-ochre/10">
        <td className="py-2 pl-5 pr-4 font-mono text-[12.5px]">{row.saleDate}{row.saleTime ? ` ${row.saleTime}` : ""}</td>
        <td className="py-2 pr-4 font-mono text-[12.5px] font-semibold">{row.gridCode ?? "直銷"}</td>
        <td className="py-2 pr-4">
          <input className="underline-input !py-1 text-[13px]" value={product} onChange={(e) => setProduct(e.target.value)} placeholder="貨品" />
          <input className="underline-input mt-1 !py-1 font-mono text-[11.5px] text-ink/70" value={note} onChange={(e) => setNote(e.target.value)} placeholder="備註（可留空）" />
        </td>
        <td className="py-2 pr-4">
          <input className="underline-input !py-1 w-16 text-right font-mono text-[13px]" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />
        </td>
        <td className="py-2 pr-4">
          <input className="underline-input !py-1 w-20 text-right font-mono text-[13px]" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
        </td>
        <td className="py-2 pr-4 text-right font-mono font-semibold">
          {/* 即時計：數量 × 單價 */}
          {Number.isFinite(Number(qty) * Number(price)) ? `$${fmtMoney(Number(qty) * Number(price))}` : "—"}
        </td>
        <td className="py-2 pr-5 text-right">
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                const qn = parseInt(qty, 10);
                const pn = Number(price);
                if (!product.trim() || !Number.isFinite(qn) || qn < 1 || !Number.isFinite(pn) || pn < 0) return toast.error("請檢查輸入");
                update.mutate({ id: row.id, productName: product.trim(), quantity: qn, unitPrice: pn, note: note || undefined });
              }}
              className="px-2 py-1 font-mono text-[11.5px] text-ochre-deep underline-offset-2 hover:underline"
            >
              保存
            </button>
            <button onClick={() => setEditing(false)} className="px-2 py-1 font-mono text-[11.5px] text-ink/50 underline-offset-2 hover:underline">
              取消
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="transition-colors hover:bg-ochre/10">
      <td className="py-3 pl-5 pr-4 font-mono text-[12.5px]">{row.saleDate}{row.saleTime ? ` ${row.saleTime}` : ""}</td>
      <td className="py-3 pr-4 font-mono text-[12.5px] font-semibold">{row.gridCode ?? <span className="text-ochre-deep">直銷</span>}</td>
      <td className="py-3 pr-4">
        {row.productName}
        {row.note && <p className="mt-0.5 max-w-xs truncate font-mono text-[10.5px] text-ink/45" title={row.note}>{row.note}</p>}
      </td>
      <td className="py-3 pr-4 text-right font-mono">{row.quantity}</td>
      <td className="py-3 pr-4 text-right font-mono">${fmtMoney(row.unitPrice)}</td>
      <td className="py-3 pr-4 text-right font-mono font-semibold">${fmtMoney(row.totalAmount)}</td>
      <td className="py-3 pr-5 text-right">
        <div className="flex justify-end gap-2">
          <button onClick={() => setEditing(true)} className="px-2 py-1 font-mono text-[11.5px] text-ink/60 underline-offset-2 hover:underline">
            修改
          </button>
          <button onClick={onDelete} className="px-2 py-1 font-mono text-[11.5px] text-red-800/80 underline-offset-2 hover:underline">
            刪除
          </button>
        </div>
      </td>
    </tr>
  );
}

/** 03 上載 CSV（標準格式） */
function CsvUpload() {
  const utils = trpc.useUtils();
  const fileRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<{ inserted: number; directCount: number; errors: { row: number; message: string }[] } | null>(null);
  const [pos, setPos] = useState<{ text: string; fileName: string } | null>(null);

  const importSales = trpc.shop.admin.importSales.useMutation({
    onSuccess: (r) => {
      setResult(r);
      if (r.inserted > 0) {
        toast.success(`成功匯入 ${r.inserted} 筆銷售${r.directCount > 0 ? `（含 ${r.directCount} 筆店舖直銷）` : ""}`);
        utils.shop.admin.listSales.invalidate();
      }
      if (r.errors.length > 0) toast.error(`${r.errors.length} 行有錯誤`);
    },
    onError: (e) => toast.error(e.message),
  });

  const handleFile = async (file: File) => {
    const text = await file.text();
    setResult(null);
    // POS 收銀機原檔（商品銷售_明細）→ 用 POS 匯入流程
    if (isPosCsv(text)) {
      setPos({ text, fileName: file.name });
      return;
    }
    setPos(null);
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
    <div className="max-w-2xl border border-ink/25 p-6">
      <p className="spec-label">Import — 銷售 CSV</p>
      <p className="mt-3 font-mono text-[11.5px] leading-[1.9] text-ink/60">
        支援兩種檔案，系統自動分辨：
        <br />
        <b>① POS 收銀機「商品銷售_明細」原檔</b>：直接上載，唔使改。格仔按「商品分類」（例如「04格」→ 格仔 004）自動分配，
        冇格號嘅貨品當店舖直銷，租金／按金自動略過。上載後會先預覽，確認先匯入。
        <br />
        <b>② 標準格式：</b>
        欄位次序：交易日期, 交易時間, 格仔編號, 商品名稱, 數量, 單價, 備註
        <br />
        例：2026-07-01, 14:30, 024, PKM散M4, 3, 125, 可留空
        <br />
        格仔編號留空 = 店舖直銷；銷售金額 = 數量 × 單價，系統自動計；每次最多 2000 行
      </p>
      <div className="mt-5">
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
        <ActionButton tone="ochre" disabled={importSales.isPending} onClick={() => fileRef.current?.click()}>
          {importSales.isPending ? "匯入中…" : pos ? "重新選擇檔案" : "選擇 CSV 檔案"}
        </ActionButton>
      </div>
      {pos && (
        <PosImport
          key={pos.fileName + pos.text.length}
          text={pos.text}
          fileName={pos.fileName}
          onCancel={() => setPos(null)}
          onDone={() => utils.shop.admin.listSales.invalidate()}
        />
      )}
      {result && (
        <div className="mt-5 border-t border-ink/15 pt-4 font-mono text-[12px] leading-[1.9]">
          <p className="text-ink">
            ✓ 成功 {result.inserted} 筆{result.directCount > 0 ? `（含 ${result.directCount} 筆店舖直銷）` : ""} · ✗ 錯誤 {result.errors.length} 行
          </p>
          {result.errors.slice(0, 10).map((er, i) => (
            <p key={i} className="text-red-800/80">第 {er.row} 行：{er.message}</p>
          ))}
        </div>
      )}
    </div>
  );
}
