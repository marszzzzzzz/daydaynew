import { useState } from "react";
import { askConfirm } from "@/components/AppDialog";
import { trpc } from "@/providers/trpc";
import { toast } from "sonner";
import { fmtMoney, todayStr } from "@/lib/format";
import { SectionTitle, Field, ActionButton, EmptyRow, statusBadge, statusLabel } from "../ui";

export default function LeasesTab() {
  const utils = trpc.useUtils();
  const leases = trpc.shop.admin.listLeases.useQuery();
  const grids = trpc.shop.admin.listGrids.useQuery();
  const tenants = trpc.shop.admin.listTenants.useQuery();

  const vacantGrids = (grids.data ?? []).filter((g) => g.status !== "occupied");

  const [fGrid, setFGrid] = useState<number | "">("");
  const [fTenant, setFTenant] = useState<number | "">("");
  const [fStart, setFStart] = useState(todayStr());
  const [fEnd, setFEnd] = useState("");
  const [fFreeDays, setFFreeDays] = useState("0");
  const [fRent, setFRent] = useState("");
  const [fDeposit, setFDeposit] = useState("");
  const [fNote, setFNote] = useState("");

  const invalidate = () => {
    utils.shop.admin.listLeases.invalidate();
    utils.shop.admin.listGrids.invalidate();
    utils.shop.admin.stats.invalidate();
    utils.shop.publicGridWall.invalidate();
    utils.shop.publicStats.invalidate();
  };

  const create = trpc.shop.admin.createLease.useMutation({
    onSuccess: (r) => {
      toast.success(`租約已建立，格仔已標記為已租出${r.assigned ? `；${r.assigned} 筆之前匯入嘅銷售已自動計入呢個租戶` : ""}`);
      utils.shop.admin.tenantSalesReport.invalidate();
      setFGrid("");
      setFTenant("");
      setFEnd("");
      setFFreeDays("0");
      setFRent("");
      setFDeposit("");
      setFNote("");
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const end = trpc.shop.admin.endLease.useMutation({
    onSuccess: () => {
      toast.success("租約已終止，格仔回復招租");
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  // 修改租約（格仔同租戶唔可以改；換格／換租戶要終止再新增）
  type LeaseRow = NonNullable<typeof leases.data>[number];
  const [editing, setEditing] = useState<number | null>(null);
  const [eStart, setEStart] = useState("");
  const [eEnd, setEEnd] = useState("");
  const [eFreeDays, setEFreeDays] = useState("");
  const [eRent, setERent] = useState("");
  const [eDeposit, setEDeposit] = useState("");
  const [eNote, setENote] = useState("");

  const update = trpc.shop.admin.updateLease.useMutation({
    onSuccess: (r) => {
      toast.success(`租約已更新${r.assigned ? `；${r.assigned} 筆銷售已按新日期計入租戶` : ""}`);
      setEditing(null);
      utils.shop.admin.tenantSalesReport.invalidate();
      utils.shop.admin.listSales.invalidate();
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const startEdit = (l: LeaseRow) => {
    setEditing(l.id);
    setEStart(l.startDate);
    setEEnd(l.endDate);
    setEFreeDays(String(l.rentFreeDays));
    setERent(String(Number(l.monthlyRent)));
    setEDeposit(String(Number(l.deposit)));
    setENote(l.note ?? "");
  };

  const saveEdit = (id: number) => {
    const freeDays = Number(eFreeDays);
    const rent = Number(eRent);
    const deposit = Number(eDeposit);
    if (!eStart || !eEnd) return toast.error("請輸入開始同結束日期");
    if (eEnd <= eStart) return toast.error("結束日期必須遲過開始日期");
    if (!Number.isInteger(freeDays) || freeDays < 0) return toast.error("免租期要係 0 或以上嘅整數");
    if (!eRent.trim() || !Number.isFinite(rent) || rent < 0) return toast.error("月租錯誤");
    if (!eDeposit.trim() || !Number.isFinite(deposit) || deposit < 0) return toast.error("按金錯誤");
    update.mutate({ id, startDate: eStart, endDate: eEnd, rentFreeDays: freeDays, monthlyRent: rent, deposit, note: eNote });
  };

  const onEditKey = (e: React.KeyboardEvent, id: number) => {
    if (e.key === "Enter" && !(e.target instanceof HTMLTextAreaElement)) saveEdit(id);
    else if (e.key === "Escape") setEditing(null);
  };
  const cell = "w-full border border-ink/40 bg-cream px-2 py-1 font-mono text-[12.5px] outline-none focus:border-ink";

  // 揀格仔時自動帶出月租
  const onPickGrid = (id: number | "") => {
    setFGrid(id);
    if (id) {
      const g = (grids.data ?? []).find((x) => x.id === id);
      if (g) {
        setFRent(String(Number(g.monthlyRent)));
        setFDeposit(String(Number(g.monthlyRent) * 2));
      }
    }
  };

  const rows = leases.data ?? [];

  return (
    <div>
      <SectionTitle
        no="05 · Leases"
        title="租約管理"
        desc="記錄租約起訖日期、免租期、月租同按金。建立租約後格仔自動標記為已租出；終止後回復招租。日期、租金寫錯可以撳「修改」直接改，唔使終止再新增。"
      />

      {/* 新增租約 */}
      <form
        className="grid gap-5 border border-ink/25 p-6 md:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          const freeDays = parseInt(fFreeDays, 10) || 0;
          const rent = Number(fRent);
          const deposit = Number(fDeposit);
          if (!fGrid) return toast.error("請揀格仔");
          if (!fTenant) return toast.error("請揀租戶");
          if (!fEnd) return toast.error("請輸入結束日期");
          if (!Number.isFinite(rent) || rent < 0) return toast.error("月租錯誤");
          if (!Number.isFinite(deposit) || deposit < 0) return toast.error("按金錯誤");
          create.mutate({ gridId: Number(fGrid), tenantId: Number(fTenant), startDate: fStart, endDate: fEnd, rentFreeDays: freeDays, monthlyRent: rent, deposit, note: fNote || undefined });
        }}
      >
        <Field label="格仔（招租中）">
          <select className="underline-input w-full bg-transparent font-mono" value={fGrid} onChange={(e) => onPickGrid(e.target.value ? Number(e.target.value) : "")}>
            <option value="">揀格仔</option>
            {vacantGrids.map((g) => (
              <option key={g.id} value={g.id}>{g.code} · ${Number(g.monthlyRent).toFixed(0)}</option>
            ))}
          </select>
        </Field>
        <Field label="租戶">
          <select className="underline-input w-full bg-transparent" value={fTenant} onChange={(e) => setFTenant(e.target.value ? Number(e.target.value) : "")}>
            <option value="">揀租戶</option>
            {(tenants.data ?? []).map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </Field>
        <Field label="開始日期">
          <input type="date" className="underline-input font-mono" value={fStart} onChange={(e) => setFStart(e.target.value)} />
        </Field>
        <Field label="結束日期">
          <input type="date" className="underline-input font-mono" value={fEnd} min={fStart} onChange={(e) => setFEnd(e.target.value)} />
        </Field>
        <Field label="免租期（日）">
          <input className="underline-input font-mono" value={fFreeDays} onChange={(e) => setFFreeDays(e.target.value)} inputMode="numeric" />
        </Field>
        <Field label="月租 HKD">
          <input className="underline-input font-mono" value={fRent} onChange={(e) => setFRent(e.target.value)} inputMode="decimal" />
        </Field>
        <Field label="按金 HKD">
          <input className="underline-input font-mono" value={fDeposit} onChange={(e) => setFDeposit(e.target.value)} inputMode="decimal" />
        </Field>
        <Field label="備註">
          <input className="underline-input" value={fNote} onChange={(e) => setFNote(e.target.value)} placeholder="可留空" />
        </Field>
        <div className="md:col-span-4">
          <ActionButton tone="ochre" disabled={create.isPending}>{create.isPending ? "建立中…" : "+ 建立租約"}</ActionButton>
        </div>
      </form>

      {/* 列表 */}
      <div className="mt-10 overflow-x-auto">
        <table className="ledger-table w-full min-w-[860px] text-[13.5px]">
          <thead>
            <tr className="text-left">
              <th className="py-3 pr-4">格仔</th>
              <th className="py-3 pr-4">租戶</th>
              <th className="py-3 pr-4">租約期</th>
              <th className="py-3 pr-4 text-right">免租期</th>
              <th className="py-3 pr-4 text-right">月租</th>
              <th className="py-3 pr-4 text-right">按金</th>
              <th className="py-3 pr-4">狀態</th>
              <th className="py-3 pr-4">備註</th>
              <th className="py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l) =>
              editing === l.id ? (
                <tr key={l.id} className="bg-ochre/10 align-top" onKeyDown={(e) => onEditKey(e, l.id)}>
                  <td className="py-3 pr-4 font-mono text-[12.5px] font-semibold">{l.gridCode}</td>
                  <td className="py-3 pr-4">{l.tenantName}</td>
                  <td className="py-2.5 pr-4">
                    <div className="flex flex-col gap-1.5">
                      <input type="date" className={cell} value={eStart} onChange={(e) => setEStart(e.target.value)} aria-label="開始日期" autoFocus />
                      <input type="date" className={cell} value={eEnd} min={eStart} onChange={(e) => setEEnd(e.target.value)} aria-label="結束日期" />
                    </div>
                  </td>
                  <td className="w-20 py-2.5 pr-4">
                    <input className={`${cell} text-right`} value={eFreeDays} onChange={(e) => setEFreeDays(e.target.value)} inputMode="numeric" aria-label="免租期（日）" />
                  </td>
                  <td className="w-24 py-2.5 pr-4">
                    <input className={`${cell} text-right`} value={eRent} onChange={(e) => setERent(e.target.value)} inputMode="decimal" aria-label="月租" />
                  </td>
                  <td className="w-24 py-2.5 pr-4">
                    <input className={`${cell} text-right`} value={eDeposit} onChange={(e) => setEDeposit(e.target.value)} inputMode="decimal" aria-label="按金" />
                  </td>
                  <td className="py-3 pr-4">
                    <span className={`badge-frame border ${statusBadge[l.status]}`}>{statusLabel[l.status]}</span>
                  </td>
                  <td className="py-2.5 pr-4">
                    <textarea className={`${cell} min-h-[58px] resize-y font-sans`} value={eNote} onChange={(e) => setENote(e.target.value)} placeholder="可留空" aria-label="備註" />
                  </td>
                  <td className="py-2.5 text-right">
                    <div className="flex flex-col items-end gap-1.5">
                      <ActionButton tone="ochre" disabled={update.isPending} onClick={() => saveEdit(l.id)}>
                        {update.isPending ? "儲存中…" : "儲存"}
                      </ActionButton>
                      <button onClick={() => setEditing(null)} className="px-2 py-1 font-mono text-[11.5px] text-ink/55 underline-offset-2 hover:underline">
                        取消
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={l.id} className="transition-colors hover:bg-ochre/10">
                  <td className="py-3 pr-4 font-mono text-[12.5px] font-semibold">{l.gridCode}</td>
                  <td className="py-3 pr-4">{l.tenantName}</td>
                  <td className="py-3 pr-4 font-mono text-[12.5px]">{l.startDate} → {l.endDate}</td>
                  <td className="py-3 pr-4 text-right font-mono">{l.rentFreeDays} 日</td>
                  <td className="py-3 pr-4 text-right font-mono">${fmtMoney(l.monthlyRent)}</td>
                  <td className="py-3 pr-4 text-right font-mono">${fmtMoney(l.deposit)}</td>
                  <td className="py-3 pr-4">
                    <span className={`badge-frame border ${statusBadge[l.status]}`}>{statusLabel[l.status]}</span>
                  </td>
                  <td className="py-3 pr-4 text-ink/55">{l.note ?? ""}</td>
                  <td className="py-3 text-right">
                    <div className="flex flex-col items-end">
                      <button
                        onClick={() => startEdit(l)}
                        disabled={editing !== null}
                        className="px-2 py-1 font-mono text-[11.5px] text-ochre-deep underline-offset-2 hover:underline disabled:opacity-30"
                      >
                        修改
                      </button>
                      {l.status === "active" && (
                        <button
                          onClick={async () => { if (await askConfirm(`確定終止 ${l.gridCode} · ${l.tenantName} 嘅租約？`, { danger: true, confirmLabel: "終止租約" })) end.mutate({ id: l.id }); }}
                          className="px-2 py-1 font-mono text-[11.5px] text-red-800/80 underline-offset-2 hover:underline"
                        >
                          終止租約
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ),
            )}
            {rows.length === 0 && <EmptyRow colSpan={9} text={leases.isLoading ? "載入中…" : "未有租約"} />}
          </tbody>
        </table>
      </div>
    </div>
  );
}
