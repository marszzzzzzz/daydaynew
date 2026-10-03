import { useState } from "react";
import { trpc } from "@/providers/trpc";
import SalesTrend from "@/components/SalesTrend";
import { SectionTitle } from "../ui";

/**
 * 12 銷售分析（店主）：用全店數據畫走勢圖，同租戶專區同一套圖（日／週／月、頭 5 位貨品、時段下鑽），
 * 可以揀範圍（全店／格仔銷售／店舖直銷），再按租戶或者格仔篩。
 */
type Scope = "all" | "grids" | "direct";
const SCOPES: { id: Scope; label: string }[] = [
  { id: "all", label: "全店" },
  { id: "grids", label: "格仔銷售" },
  { id: "direct", label: "店舖直銷" },
];

const selectCls = "border border-ink/30 bg-cream px-3 py-2 text-[13px] outline-none focus:border-ink disabled:opacity-40";

export default function AnalyticsTab() {
  const [scope, setScope] = useState<Scope>("all");
  const [tenantId, setTenantId] = useState<number | "">("");
  const [gridCode, setGridCode] = useState("");
  const range = trpc.shop.admin.salesDateRange.useQuery();
  const tenants = trpc.shop.admin.listTenants.useQuery();
  const grids = trpc.shop.admin.listGrids.useQuery();

  const narrowed = tenantId !== "" || gridCode !== "";
  const effectiveScope: Scope = narrowed ? "grids" : scope;
  const label = tenantId !== ""
    ? `租戶：${tenants.data?.find((t) => t.id === tenantId)?.name ?? ""}`
    : gridCode
      ? `格仔 ${gridCode}`
      : SCOPES.find((s) => s.id === scope)!.label;

  return (
    <div>
      <SectionTitle
        no="12 · Sales Analytics"
        title="全店銷售分析"
        desc="用全店銷售數據睇走勢：每日／週／月總銷售、頭 5 位貨品，撳柱或者時段列表下鑽。可以只睇格仔銷售、店舖直銷，或者某個租戶／格仔。"
      />

      {/* 篩選：一行，喺圖之上 */}
      <div className="flex flex-wrap items-center gap-3 border border-ink/25 p-4">
        <div className="flex border border-ink/30" role="tablist" aria-label="範圍">
          {SCOPES.map((s) => (
            <button
              key={s.id}
              role="tab"
              aria-selected={effectiveScope === s.id && !narrowed}
              disabled={narrowed}
              onClick={() => setScope(s.id)}
              className={`px-3.5 py-1.5 text-[13px] transition-colors disabled:opacity-40 ${
                !narrowed && scope === s.id ? "bg-ink text-cream" : "hover:bg-ink/5"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <select
          className={selectCls}
          value={tenantId}
          disabled={scope === "direct"}
          onChange={(e) => {
            setTenantId(e.target.value ? Number(e.target.value) : "");
            setGridCode("");
          }}
          aria-label="租戶"
        >
          <option value="">全部租戶</option>
          {(tenants.data ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select
          className={selectCls}
          value={gridCode}
          disabled={scope === "direct"}
          onChange={(e) => {
            setGridCode(e.target.value);
            setTenantId("");
          }}
          aria-label="格仔"
        >
          <option value="">全部格仔</option>
          {(grids.data ?? []).map((g) => (
            <option key={g.code} value={g.code}>
              格仔 {g.code}
              {g.size === "L" ? "（大）" : ""}
            </option>
          ))}
        </select>
        {narrowed && (
          <button
            onClick={() => {
              setTenantId("");
              setGridCode("");
            }}
            className="font-mono text-[12px] text-ochre-deep underline-offset-2 hover:underline"
          >
            清除篩選
          </button>
        )}
        <span className="ml-auto font-mono text-[11.5px] text-ink/55">而家睇緊：{label}</span>
      </div>

      {range.data && !range.data.max ? (
        <p className="mt-10 text-center text-[13.5px] text-ink/50">未有任何銷售記錄</p>
      ) : (
        range.data && (
          <SalesTrend
            title={`${
              tenantId !== "" ? tenants.data?.find((t) => t.id === tenantId)?.name ?? "" : gridCode ? `格仔 ${gridCode}` : SCOPES.find((x) => x.id === scope)!.label
            } 銷售走勢`}
            source={{
              kind: "shop",
              scope: effectiveScope,
              tenantId: tenantId === "" ? undefined : tenantId,
              gridCode: gridCode || undefined,
            }}
            latestMonth={range.data.max?.slice(0, 7) ?? null}
          />
        )
      )}
    </div>
  );
}
