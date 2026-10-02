import { useMemo, useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../../server/router";
import { trpc } from "@/providers/trpc";
import { fmtMoney, todayStr } from "@/lib/format";
import { downloadCsv } from "@/lib/csv";
import { toast } from "sonner";
import { SectionTitle, Field, ActionButton, EmptyRow } from "../ui";

/** 11 租戶銷售：揀期間，比較每個租戶（同未有租約嘅格仔）嘅銷售 */

type Preset = "thisMonth" | "lastMonth" | "last30" | "thisYear" | "custom";

function monthRange(offset: number) {
  const d = new Date();
  const first = new Date(d.getFullYear(), d.getMonth() + offset, 1);
  const last = new Date(d.getFullYear(), d.getMonth() + offset + 1, 0);
  const f = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  return { from: f(first), to: f(last) };
}

function presetRange(p: Preset): { from: string; to: string } | null {
  const today = todayStr();
  if (p === "thisMonth") return { from: today.slice(0, 8) + "01", to: today };
  if (p === "lastMonth") return monthRange(-1);
  if (p === "last30") {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    return { from: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`, to: today };
  }
  if (p === "thisYear") return { from: today.slice(0, 4) + "-01-01", to: today };
  return null;
}

const PRESETS: { id: Preset; label: string }[] = [
  { id: "thisMonth", label: "本月" },
  { id: "lastMonth", label: "上月" },
  { id: "last30", label: "近 30 日" },
  { id: "thisYear", label: "今年" },
  { id: "custom", label: "自訂" },
];

function Change({ now, prev }: { now: number; prev: number }) {
  if (prev === 0 && now === 0) return <span className="text-ink/35">—</span>;
  if (prev === 0) return <span className="text-ochre-deep">新</span>;
  const pct = ((now - prev) / prev) * 100;
  const up = pct >= 0;
  return (
    <span className={up ? "text-emerald-800" : "text-red-800"}>
      {up ? "▲" : "▼"} {Math.abs(pct).toFixed(0)}%
    </span>
  );
}

export default function TenantSalesTab() {
  const [preset, setPreset] = useState<Preset>("thisYear");
  const [custom, setCustom] = useState(() => presetRange("thisYear")!);
  const range = preset === "custom" ? custom : presetRange(preset)!;
  const report = trpc.shop.admin.tenantSalesReport.useQuery(range, { enabled: range.from <= range.to });
  const [open, setOpen] = useState<string | null>(null);
  const [showDirect, setShowDirect] = useState(true);

  const utils = trpc.useUtils();
  const rematch = trpc.shop.admin.assignSalesToLeases.useMutation({
    onSuccess: (r) => {
      toast.success(r.assigned ? `已將 ${r.assigned} 筆銷售按租約期間計入租戶` : "冇需要配對嘅銷售（未有租約涵蓋嗰啲日期）");
      void utils.shop.admin.tenantSalesReport.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const d = report.data;
  const groups = useMemo(() => (d?.groups ?? []).filter((g) => showDirect || g.kind !== "direct"), [d, showDirect]);
  const maxAmount = Math.max(1, ...groups.map((g) => g.amount));

  const exportCsv = () => {
    if (!d) return;
    const head = ["期間", "租戶／格仔", "格仔", "筆數", "數量", "銷售額", "佔比%", "上一期銷售額", "現時月租", "最後銷售日"];
    const lines = d.groups.map((g) =>
      [`${d.from}~${d.to}`, g.name, g.grids.join(" "), g.count, g.qty, g.amount, g.share, g.prevAmount, g.monthlyRent ?? "", g.lastSaleDate ?? ""]
        .map((v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v)))
        .join(","),
    );
    downloadCsv(`租戶銷售-${d.from}-${d.to}.csv`, [head.join(","), ...lines].join("\n"));
  };

  return (
    <div>
      <SectionTitle
        no="11 · Tenant Sales"
        title="租戶銷售情況"
        desc="揀一段期間，比較每個租戶賣得幾多、邊樣貨最好賣、同上一段時間比升定跌。未有租約嘅格仔會獨立列出。"
      />

      {/* 期間 */}
      <div className="flex flex-wrap items-end gap-3 border border-ink/25 p-5">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPreset(p.id)}
              className={`border px-3 py-1.5 font-mono text-[12px] transition-colors ${
                preset === p.id ? "border-ink bg-ink text-cream" : "border-ink/30 hover:border-ink"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="flex flex-wrap items-end gap-3">
            <Field label="由">
              <input type="date" className="underline-input !w-auto font-mono" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />
            </Field>
            <Field label="至">
              <input type="date" className="underline-input !w-auto font-mono" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
            </Field>
          </div>
        )}
        <div className="ml-auto flex items-center gap-4">
          <label className="flex items-center gap-2 text-[12.5px]">
            <input type="checkbox" checked={showDirect} onChange={(e) => setShowDirect(e.target.checked)} />
            顯示店舖直銷
          </label>
          <ActionButton tone="ghost" disabled={!d} onClick={exportCsv}>
            匯出 CSV
          </ActionButton>
        </div>
      </div>
      {d && (
        <p className="mt-2 font-mono text-[11px] text-ink/50">
          {d.from} 至 {d.to}（{d.days} 日）· 比較期間：{d.prev.from} 至 {d.prev.to}
        </p>
      )}

      {/* 總數 */}
      {d && (
        <div className="mt-6 grid gap-[3px] border border-ink/25 bg-ink/10 sm:grid-cols-4">
          <Stat label="全店銷售" value={`$${fmtMoney(d.totals.amount)}`} sub={<Change now={d.totals.amount} prev={d.prev.amount} />} />
          <Stat label="格仔銷售" value={`$${fmtMoney(d.totals.gridAmount)}`} sub={`${d.totals.sellers} 個租戶／格仔有銷售`} />
          <Stat label="店舖直銷" value={`$${fmtMoney(d.totals.directAmount)}`} />
          <Stat label="銷售筆數" value={`${d.totals.count} 筆`} />
        </div>
      )}
      {d && d.totals.unassignedGrids > 0 && (
        <p className="mt-3 border border-ochre-deep/50 bg-ochre/10 px-4 py-2.5 text-[12.5px] leading-[1.8] text-ink/75">
          ⚠ 有 {d.totals.unassignedGrids} 個格仔有銷售但未有租約涵蓋，所以未計入任何租戶。喺「05 租約管理」建立租約後，租約期間內嘅銷售（包括以前匯入嘅）會自動計入租戶。
          <button
            onClick={() => rematch.mutate()}
            disabled={rematch.isPending}
            className="ml-2 font-mono text-[12px] text-ochre-deep underline underline-offset-2 disabled:opacity-40"
          >
            {rematch.isPending ? "配對中…" : "立即重新配對"}
          </button>
        </p>
      )}

      {/* 排行 */}
      <div className="mt-6 overflow-x-auto border border-ink/25">
        <table className="ledger-table w-full min-w-[820px] text-[13.5px]">
          <thead>
            <tr className="text-left">
              <th className="py-3 pl-5 pr-4">#</th>
              <th className="py-3 pr-4">租戶／格仔</th>
              <th className="py-3 pr-4">格仔</th>
              <th className="py-3 pr-4 text-right">筆數</th>
              <th className="py-3 pr-4 text-right">數量</th>
              <th className="w-[26%] py-3 pr-4">銷售額</th>
              <th className="py-3 pr-4 text-right">對上一期</th>
              <th className="py-3 pr-5 text-right">月租</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g, i) => (
              <GroupRows key={g.key} g={g} rank={g.kind === "direct" ? null : i + 1} max={maxAmount} open={open === g.key} toggle={() => setOpen(open === g.key ? null : g.key)} />
            ))}
            {groups.length === 0 && <EmptyRow colSpan={8} text={report.isLoading ? "載入中…" : "呢段期間未有銷售"} />}
          </tbody>
        </table>
      </div>
      <p className="mt-2 font-mono text-[10.5px] leading-[1.8] text-ink/45">
        撳任何一行睇熱賣貨品同每日走勢。POS 檔一次匯入一段期間，所以走勢會集中喺記帳日期。
      </p>
    </div>
  );
}

type G = inferRouterOutputs<AppRouter>["shop"]["admin"]["tenantSalesReport"]["groups"][number];

function GroupRows({ g, rank, max, open, toggle }: { g: G; rank: number | null; max: number; open: boolean; toggle: () => void }) {
  const dailyMax = Math.max(1, ...g.daily.map((x) => x.amount));
  return (
    <>
      <tr onClick={toggle} className={`cursor-pointer transition-colors hover:bg-ochre/10 ${open ? "bg-ochre/10" : ""}`}>
        <td className="py-3 pl-5 pr-4 font-mono text-[12px] text-ink/50">{rank ?? ""}</td>
        <td className="py-3 pr-4">
          <span className={`font-semibold ${g.kind === "direct" ? "text-ochre-deep" : ""}`}>{g.name}</span>
          {g.kind === "tenant" && g.count === 0 && <p className="font-mono text-[10.5px] text-red-800">期間冇銷售</p>}
        </td>
        <td className="py-3 pr-4 font-mono text-[12px]">{g.grids.join(" · ") || "—"}</td>
        <td className="py-3 pr-4 text-right font-mono">{g.count}</td>
        <td className="py-3 pr-4 text-right font-mono">{g.qty}</td>
        <td className="py-3 pr-4">
          <div className="flex items-center gap-3">
            <div className="h-2.5 flex-1 bg-ink/10">
              <div className={`h-full ${g.kind === "direct" ? "bg-ochre" : "bg-ink"}`} style={{ width: `${(g.amount / max) * 100}%` }} />
            </div>
            <span className="w-24 text-right font-mono font-semibold">${fmtMoney(g.amount)}</span>
            <span className="w-12 text-right font-mono text-[11px] text-ink/50">{g.share}%</span>
          </div>
        </td>
        <td className="py-3 pr-4 text-right font-mono text-[12px]">
          <Change now={g.amount} prev={g.prevAmount} />
        </td>
        <td className="py-3 pr-5 text-right font-mono text-[12px]">{g.monthlyRent != null ? `$${fmtMoney(g.monthlyRent)}` : "—"}</td>
      </tr>
      {open && (
        <tr className="bg-cream-2/40">
          <td colSpan={8} className="px-5 py-5">
            <div className="grid gap-8 md:grid-cols-2">
              <div>
                <p className="spec-label mb-2">熱賣貨品（按銷售額）</p>
                {g.topProducts.length === 0 ? (
                  <p className="text-[12.5px] text-ink/50">期間未有銷售</p>
                ) : (
                  <table className="w-full text-[12.5px]">
                    <tbody>
                      {g.topProducts.map((p) => (
                        <tr key={p.name} className="border-b border-ink/10">
                          <td className="py-1.5 pr-3">{p.name}</td>
                          <td className="py-1.5 pr-3 text-right font-mono text-ink/60">× {p.qty}</td>
                          <td className="py-1.5 text-right font-mono font-semibold">${fmtMoney(p.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div>
                <p className="spec-label mb-2">每日銷售</p>
                {g.daily.length === 0 ? (
                  <p className="text-[12.5px] text-ink/50">期間未有銷售</p>
                ) : (
                  <div className="space-y-1">
                    {g.daily.slice(-31).map((x) => (
                      <div key={x.date} className="flex items-center gap-2 font-mono text-[11px]">
                        <span className="w-20 text-ink/55">{x.date.slice(5)}</span>
                        <div className="h-2 flex-1 bg-ink/10">
                          <div className="h-full bg-ochre-deep" style={{ width: `${(x.amount / dailyMax) * 100}%` }} />
                        </div>
                        <span className="w-20 text-right">${fmtMoney(x.amount)}</span>
                      </div>
                    ))}
                    {g.daily.length > 31 && <p className="font-mono text-[10.5px] text-ink/45">只顯示最近 31 個有銷售嘅日子</p>}
                  </div>
                )}
                {g.lastSaleDate && <p className="mt-3 font-mono text-[11px] text-ink/55">最後銷售：{g.lastSaleDate}</p>}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: React.ReactNode }) {
  return (
    <div className="bg-cream px-5 py-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink/50">{label}</p>
      <p className="mt-1.5 font-mono text-[16px] font-semibold">{value}</p>
      {sub && <p className="mt-1 font-mono text-[11px] text-ink/55">{sub}</p>}
    </div>
  );
}
