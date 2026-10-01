import { useMemo, useState } from "react";
import { trpc } from "@/providers/trpc";
import { toast } from "sonner";
import { fmtMoney, todayStr } from "@/lib/format";
import { SectionTitle, Field, ActionButton, EmptyRow } from "../ui";

export default function SalesTab() {
  const utils = trpc.useUtils();

  // 篩選
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [gridId, setGridId] = useState<number | undefined>();
  const [tenantId, setTenantId] = useState<number | undefined>();

  const sales = trpc.shop.admin.listSales.useQuery({ from: from || undefined, to: to || undefined, gridId, tenantId });
  const grids = trpc.shop.admin.listGrids.useQuery();
  const tenants = trpc.shop.admin.listTenants.useQuery();

  const occupiedGrids = useMemo(() => (grids.data ?? []).filter((g) => g.status === "occupied"), [grids.data]);

  // 新增銷售
  const [fDate, setFDate] = useState(todayStr());
  const [fTime, setFTime] = useState("");
  const [fGrid, setFGrid] = useState<number | "direct" | "">("");
  const [fProduct, setFProduct] = useState("");
  const [fQty, setFQty] = useState("1");
  const [fPrice, setFPrice] = useState("");
  const [fNote, setFNote] = useState("");

  const invalidate = () => {
    utils.shop.admin.listSales.invalidate();
    utils.shop.admin.stats.invalidate();
  };

  const create = trpc.shop.admin.createSale.useMutation({
    onSuccess: () => {
      toast.success("銷售已記錄");
      setFProduct("");
      setFQty("1");
      setFPrice("");
      setFNote("");
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const del = trpc.shop.admin.deleteSale.useMutation({
    onSuccess: () => {
      toast.success("已刪除");
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const total = useMemo(
    () => (sales.data ?? []).reduce((acc, r) => acc + Number(r.totalAmount), 0),
    [sales.data],
  );

  return (
    <div>
      <SectionTitle
        no="03 · Sales"
        title="銷售記錄"
        desc="每日更新每個格仔售出嘅貨品數目同售價。揀格仔後系統會自動對返生效租約嘅租戶。"
      />

      {/* 記錄銷售 */}
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
      </form>

      {/* 篩選 */}
      <div className="mt-10 flex flex-wrap items-end gap-6">
        <Field label="由">
          <input type="date" className="underline-input !w-auto font-mono" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="至">
          <input type="date" className="underline-input !w-auto font-mono" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Field label="格仔">
          <select className="underline-input !w-auto bg-transparent font-mono" value={gridId ?? ""} onChange={(e) => setGridId(e.target.value ? Number(e.target.value) : undefined)}>
            <option value="">全部</option>
            {(grids.data ?? []).map((g) => (
              <option key={g.id} value={g.id}>{g.code}</option>
            ))}
          </select>
        </Field>
        <Field label="租戶">
          <select className="underline-input !w-auto bg-transparent" value={tenantId ?? ""} onChange={(e) => setTenantId(e.target.value ? Number(e.target.value) : undefined)}>
            <option value="">全部</option>
            {(tenants.data ?? []).map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </Field>
        <p className="ml-auto font-mono text-[12px] text-ink/60">
          共 {sales.data?.length ?? 0} 筆 · 合計 <span className="font-semibold text-ink">${fmtMoney(total)}</span>
        </p>
      </div>

      {/* 列表 */}
      <div className="mt-5 overflow-x-auto">
        <table className="ledger-table w-full min-w-[760px] text-[13.5px]">
          <thead>
            <tr className="text-left">
              <th className="py-3 pr-4">日期</th>
              <th className="py-3 pr-4">格仔</th>
              <th className="py-3 pr-4">租戶</th>
              <th className="py-3 pr-4">貨品</th>
              <th className="py-3 pr-4 text-right">數量</th>
              <th className="py-3 pr-4 text-right">單價</th>
              <th className="py-3 pr-4 text-right">金額</th>
              <th className="py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {(sales.data ?? []).map((r) => (
              <SaleRow key={r.id} row={r} onDelete={() => { if (confirm("確定刪除呢筆記錄？")) del.mutate({ id: r.id }); }} onSaved={invalidate} />
            ))}
            {(sales.data ?? []).length === 0 && <EmptyRow colSpan={8} text={sales.isLoading ? "載入中…" : "冇符合條件嘅記錄"} />}
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

function SaleRow({ row, onDelete, onSaved }: { row: SaleRowData; onDelete: () => void; onSaved: () => void }) {
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
        <td className="py-2 pr-4 font-mono text-[12.5px]">{row.saleDate}{row.saleTime ? ` ${row.saleTime}` : ""}</td>
        <td className="py-2 pr-4 font-mono text-[12.5px] font-semibold">{row.gridCode ?? "直銷"}</td>
        <td className="py-2 pr-4 text-[12.5px]">{row.tenantName ?? "店舖直銷"}</td>
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
          {Number.isFinite(Number(qty) * Number(price)) ? `$${fmtMoney(Number(qty) * Number(price))}` : "—"}
        </td>
        <td className="py-2 text-right">
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                const q = parseInt(qty, 10);
                const p = Number(price);
                if (!product.trim() || !Number.isFinite(q) || q < 1 || !Number.isFinite(p) || p < 0) return toast.error("請檢查輸入");
                update.mutate({ id: row.id, productName: product.trim(), quantity: q, unitPrice: p, note: note || undefined });
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
      <td className="py-3 pr-4 font-mono text-[12.5px]">{row.saleDate}{row.saleTime ? ` ${row.saleTime}` : ""}</td>
      <td className="py-3 pr-4 font-mono text-[12.5px] font-semibold">{row.gridCode ?? <span className="text-ochre-deep">直銷</span>}</td>
      <td className="py-3 pr-4">{row.tenantName ?? <span className="text-ink/45">店舖直銷</span>}</td>
      <td className="py-3 pr-4">
        {row.productName}
        {row.note && <p className="mt-0.5 max-w-xs truncate font-mono text-[10.5px] text-ink/45" title={row.note}>{row.note}</p>}
      </td>
      <td className="py-3 pr-4 text-right font-mono">{row.quantity}</td>
      <td className="py-3 pr-4 text-right font-mono">${fmtMoney(row.unitPrice)}</td>
      <td className="py-3 pr-4 text-right font-mono font-semibold">${fmtMoney(row.totalAmount)}</td>
      <td className="py-3 text-right">
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
