import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import DashHeader from "@/components/DashHeader";
import OverviewTab from "./tabs/OverviewTab";
import GridsTab from "./tabs/GridsTab";
import SalesTab from "./tabs/SalesTab";
import RentTab from "./tabs/RentTab";
import LeasesTab from "./tabs/LeasesTab";
import TenantsTab from "./tabs/TenantsTab";
import CsvTab from "./tabs/CsvTab";
import DemoTab from "./tabs/DemoTab";
import WeeklyTab from "./tabs/WeeklyTab";
import PayrollTab from "./tabs/PayrollTab";
import TenantSalesTab from "./tabs/TenantSalesTab";
import AnalyticsTab from "./tabs/AnalyticsTab";

const TABS = [
  { id: "overview", no: "01", label: "總覽" },
  { id: "grids", no: "02", label: "格仔管理" },
  { id: "sales", no: "03", label: "銷售記錄" },
  { id: "rent", no: "04", label: "租金按金" },
  { id: "leases", no: "05", label: "租約管理" },
  { id: "tenants", no: "06", label: "租戶管理" },
  { id: "csv", no: "07", label: "匯入匯出" },
  { id: "demo", no: "08", label: "示範資料" },
  { id: "weekly", no: "09", label: "週結報表" },
  { id: "payroll", no: "10", label: "兼職人工" },
  { id: "tenantSales", no: "11", label: "租戶銷售" },
  { id: "analytics", no: "12", label: "銷售分析" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function AdminDashboard() {
  const { user, isLoading } = useAuth({ redirectOnUnauthenticated: true });
  const [tab, setTab] = useState<TabId>("overview");

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream">
        <p className="font-mono text-[12px] uppercase tracking-[0.22em] text-ink/50">載入中…</p>
      </div>
    );
  }

  if (user && user.role !== "admin") {
    const isStaff = user.role === "staff";
    return (
      <div className="min-h-screen bg-cream text-ink">
        <DashHeader roleLabel={isStaff ? "店員 Staff" : "租客 Tenant · 唯讀"} />
        <main className="mx-auto max-w-2xl px-5 py-24 text-center">
          <p className="font-display text-6xl font-black text-ochre">×</p>
          <h1 className="font-display mt-6 text-3xl font-black tracking-tight">呢度係店主專用</h1>
          <p className="mt-5 text-[14.5px] text-ink/70">
            {isStaff
              ? "你嘅戶口係店員身份，請去店員專區記錄銷售同上載 CSV。"
              : "你嘅戶口係租客身份（唯讀），請去租戶專區睇自己格仔嘅銷售數據。"}
          </p>
          <a
            href={isStaff ? "/staff" : "/tenant"}
            className="mt-8 inline-block border border-ink px-6 py-3 font-mono text-[12.5px] tracking-wide transition-colors hover:bg-ink hover:text-cream"
          >
            去{isStaff ? "店員專區" : "租戶專區"} →
          </a>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream text-ink">
      <DashHeader roleLabel="店主 Admin · 全店管理" />

      {/* 分頁導航 */}
      <nav className="border-b border-ink/15">
        <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-5">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex shrink-0 items-baseline gap-2 border-b-2 px-4 py-4 text-[13.5px] transition-colors ${
                tab === t.id
                  ? "border-ink font-semibold"
                  : "border-transparent text-ink/55 hover:text-ink"
              }`}
            >
              <span className="font-mono text-[10px] text-ochre-deep">{t.no}</span>
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      <main className="mx-auto max-w-6xl px-5 py-12">
        {tab === "overview" && <OverviewTab goTab={setTab} />}
        {tab === "grids" && <GridsTab />}
        {tab === "sales" && <SalesTab />}
        {tab === "rent" && <RentTab />}
        {tab === "leases" && <LeasesTab />}
        {tab === "tenants" && <TenantsTab />}
        {tab === "csv" && <CsvTab />}
        {tab === "demo" && <DemoTab />}
        {tab === "weekly" && <WeeklyTab />}
        {tab === "payroll" && <PayrollTab />}
        {tab === "tenantSales" && <TenantSalesTab />}
        {tab === "analytics" && <AnalyticsTab />}
      </main>
    </div>
  );
}
