import { useState } from "react";
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
    onSuccess: () => {
      toast.success("租約已建立，格仔已標記為已租出");
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
        desc="記錄租約起訖日期、免租期、月租同按金。建立租約後格仔自動標記為已租出；終止後回復招租。"
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
            {rows.map((l) => (
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
                  {l.status === "active" && (
                    <button
                      onClick={() => { if (confirm(`確定終止 ${l.gridCode} · ${l.tenantName} 嘅租約？`)) end.mutate({ id: l.id }); }}
                      className="px-2 py-1 font-mono text-[11.5px] text-red-800/80 underline-offset-2 hover:underline"
                    >
                      終止租約
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <EmptyRow colSpan={9} text={leases.isLoading ? "載入中…" : "未有租約"} />}
          </tbody>
        </table>
      </div>
    </div>
  );
}
