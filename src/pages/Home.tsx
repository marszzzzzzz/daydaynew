import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "react-router";
import Noise from "@/components/Noise";
import GridWall, { type WallGrid } from "@/components/GridWall";
import StrokeButton from "@/components/StrokeButton";
import { fmtMoney } from "@/lib/format";
import { allGridCodes, gridSizeOf, gridRentOf } from "@contracts/gridLayout";

/** 資料庫未就緒時嘅靜態格仔牆：同真實佈局一致（10 排 × 7，編號 001–070；第 3、4 排大格 $700，其餘中格 $500） */
const FALLBACK_WALL: WallGrid[] = allGridCodes().map((code) => ({
  code,
  size: gridSizeOf(code),
  status: "vacant",
  monthlyRent: gridRentOf(code).toFixed(0),
}));

export default function Home() {
  const { data: stats } = trpc.shop.publicStats.useQuery();
  const wallQuery = trpc.shop.publicGridWall.useQuery();
  const wall = wallQuery.data ?? (wallQuery.isError ? FALLBACK_WALL : []);
  const { user, isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen bg-cream text-ink">
      <Noise />

      {/* ─── 導航 ─── */}
      <header className="fixed inset-x-0 top-0 z-50 border-b border-ink/15 bg-cream/85 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-5">
          <Link to="/" className="flex min-w-0 items-center gap-2 sm:gap-2.5">
            <img src="/logo.png" alt="Day-Day New 日日新 logo" width={44} height={42} className="h-10 w-auto shrink-0 sm:h-11" />
            <span className="whitespace-nowrap font-display text-[19px] font-black tracking-tight sm:text-[22px]">日日新格仔鋪</span>
            <span className="hidden font-mono text-[11px] uppercase tracking-[0.22em] text-ink/55 sm:inline">DayDayNew.HK</span>
          </Link>
          <nav className="hidden items-center gap-7 font-mono text-[12px] uppercase tracking-[0.16em] text-ink/70 md:flex">
            <a href="#wall" className="transition-colors hover:text-ochre-deep">格仔現況</a>
            <a href="#why" className="transition-colors hover:text-ochre-deep">點解租格</a>
            <a href="#pricing" className="transition-colors hover:text-ochre-deep">收費</a>
            <a href="#how" className="transition-colors hover:text-ochre-deep">點樣開始</a>
          </nav>
          <Link
            to={isAuthenticated ? "/dashboard" : "/login"}
            className="shrink-0 whitespace-nowrap border border-ink px-3 py-2 font-mono text-[12px] uppercase tracking-[0.16em] transition-colors hover:bg-ink hover:text-cream sm:px-4"
          >
            {isAuthenticated ? (
              <>
                進入專區<span className="hidden sm:inline"> · {user?.name ?? ""}</span>
              </>
            ) : (
              "登入"
            )}
          </Link>
        </div>
      </header>

      {/* ─── Hero ─── */}
      <section className="mx-auto grid max-w-6xl gap-12 px-5 pb-24 pt-36 md:grid-cols-[1.05fr_0.95fr] md:items-center md:pt-44">
        <div>
          <p className="spec-label mb-6">格仔租賃 · 寄賣平台 · Rental &amp; Consignment</p>
          <h1 className="font-display text-balance text-[52px] font-black leading-[1.08] tracking-tight md:text-[76px]">
            一格，
            <br />
            就係你嘅舖頭。
          </h1>
          <p className="mt-3 font-display text-[15px] font-semibold uppercase tracking-[0.3em] text-ochre-deep">
            One grid. Your shop.
          </p>
          <p className="mt-7 max-w-md text-[15px] leading-[1.9] text-ink/75">
            唔使成間舖租落嚟，一個格仔就可以開賣你嘅手作、figure、文具、古著。
            店員幫你上架收銀，每日售出紀錄即時上網 —— 你安坐家中，對數一清二楚。
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <a href="#how">
              <StrokeButton variant="solid">開始租格</StrokeButton>
            </a>
            <Link to="/login">
              <StrokeButton variant="outline">租戶 / 店主登入</StrokeButton>
            </Link>
          </div>
          <p className="mt-8 font-mono text-[11px] uppercase tracking-[0.18em] text-ink/50">
            免上車費 · 即租即賣 · 銷售記錄每日更新
          </p>
        </div>

        {/* 格仔牆 */}
        <div id="wall" className="scroll-mt-28">
          <div className="mb-4 flex items-baseline justify-between">
            <p className="spec-label">Live · 格仔現況</p>
            <p className="font-mono text-[11px] text-ink/50">
              {stats
                ? `${stats.grids.vacant} 格招租中`
                : wallQuery.isError
                  ? "示範牆 · 70 格"
                  : "載入中…"}
            </p>
          </div>
          <GridWall grids={wall} />
          <div className="mt-5 flex items-center gap-6 font-mono text-[10px] uppercase tracking-[0.16em] text-ink/55">
            <span className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 border border-ink/40 bg-cream" /> 招租中
            </span>
            <span className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 bg-ink" /> 已租出
            </span>
            <span className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 bg-ochre/40" /> 已預留
            </span>
          </div>
        </div>
      </section>

      {/* ─── 數據帶（黑） ─── */}
      <section className="bg-ink text-cream">
        <div className="mx-auto grid max-w-6xl grid-cols-2 divide-x divide-cream/15 px-5 md:grid-cols-4">
          <StatCell label="格仔總數" value={stats ? String(stats.grids.total) : "—"} sub="grids" />
          <StatCell label="已租出" value={stats ? String(stats.grids.occupied) : "—"} sub="occupied" />
          <StatCell label="出租率" value={stats ? `${stats.occupancyRate}%` : "—"} sub="occupancy" />
          <StatCell label="活躍租戶" value={stats ? String(stats.tenants) : "—"} sub="tenants" />
        </div>
      </section>

      {/* ─── 點解租格仔 ─── */}
      <section id="why" className="mx-auto max-w-6xl scroll-mt-28 px-5 py-28">
        <p className="spec-label mb-4">Why DayDayNew — 點解租格仔？</p>
        <h2 className="font-display max-w-2xl text-4xl font-black leading-tight tracking-tight md:text-5xl">
          用一個格仔嘅租金，
          <br />
          試出你盤生意。
        </h2>
        <div className="mt-14">
          <WhyRow
            no="01"
            title="低成本開舖"
            body="每月幾百蚊，你嘅貨就企喺人流舖頭嘅格仔入面。唔使裝修、唔使睇舖、唔使交差餉管理費。"
          />
          <WhyRow
            no="02"
            title="銷售透明"
            body="店主每日更新售出數目同售價，租戶登入即時睇到自己嘅銷售記錄 —— 賣出幾多件、每件幾多錢，白紙黑字。"
          />
          <WhyRow
            no="03"
            title="租約靈活"
            body="短租長租都得，簽約可議免租期。租約日期、按金、月租全部系統留底，唔怕口同鼻拗。"
          />
          <WhyRow
            no="04"
            title="專人打理"
            body="上架、陳列、收銀由店員負責。你專心入貨同創作，其餘交畀舖頭。"
          />
        </div>
      </section>

      {/* ─── 收費 ─── */}
      <section id="pricing" className="scroll-mt-28 border-y border-ink/15 bg-cream-2/60">
        <div className="mx-auto max-w-6xl px-5 py-28">
          <p className="spec-label mb-4">Pricing — 收費</p>
          <h2 className="font-display text-4xl font-black tracking-tight md:text-5xl">兩種格，豐儉由人。</h2>
          <div className="mt-14">
            <PriceRow
              size="M"
              name="中格"
              desc="飾物、襟章、文具、Figure、小精品"
              rent={rentOf(stats?.sizeRent, "M") ?? "500"}
            />
            <PriceRow
              size="L"
              name="大格"
              desc="古著、波鞋、大型擺設 · 位於第三、四行當眼位置"
              rent={rentOf(stats?.sizeRent, "L") ?? "700"}
              last
            />
          </div>
          <p className="mt-8 font-mono text-[11px] uppercase tracking-[0.16em] text-ink/50">
            每格每月收費 · 包上架及收銀 · 簽約收一個月按金 · 可議免租期
          </p>
        </div>
      </section>

      {/* ─── 點樣開始 ─── */}
      <section id="how" className="mx-auto max-w-6xl scroll-mt-28 px-5 py-28">
        <p className="spec-label mb-4">How it works — 點樣開始</p>
        <div className="grid gap-x-10 gap-y-14 md:grid-cols-4">
          <Step no="1" title="揀格" body="睇吓上面格仔牆，邊格招租中、乜尺寸、幾多錢，一目了然。" />
          <Step no="2" title="簽約" body="同店主傾好租期同免租期，交按金，格仔即刻屬於你。" />
          <Step no="3" title="入貨開賣" body="交貨畀店員上架，你嘅格仔正式開張。" />
          <Step no="4" title="每日對數" body="登入租戶專區，每日售出幾多、賣幾多錢，日日更新。" />
        </div>
      </section>

      {/* ─── CTA（黑） ─── */}
      <section className="bg-ink text-cream">
        <div className="mx-auto max-w-6xl px-5 py-28 text-center">
          <p className="spec-label mb-6 !text-cream/50">Ready? — 準備好未？</p>
          <h2 className="font-display text-balance text-5xl font-black leading-tight tracking-tight md:text-6xl">
            你嘅第一格，
            <br />
            今日開始。
          </h2>
          <div className="mt-12 flex justify-center">
            <Link to="/login">
              <StrokeButton variant="cream">立即登入 / 開戶</StrokeButton>
            </Link>
          </div>
        </div>
        <footer className="border-t border-cream/15">
          <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-5 py-8 font-mono text-[11px] uppercase tracking-[0.16em] text-cream/50 md:flex-row md:items-center">
            <span>日日新格仔鋪 DayDayNew.HK</span>
            <span>旺角 · 每日 13:00 – 21:00</span>
            <span>© {new Date().getFullYear()} DayDayNew.HK</span>
          </div>
        </footer>
      </section>
    </div>
  );
}

function rentOf(sizeRent: { size: string; minRent: string }[] | undefined, size: string): string | null {
  const row = sizeRent?.find((r) => r.size === size);
  return row ? `$${fmtMoney(row.minRent).replace(/\.00$/, "")}` : null;
}

function StatCell({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="px-6 py-10 md:px-10">
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-cream/45">{sub}</p>
      <p className="font-mono mt-2 text-4xl font-semibold tracking-tight md:text-5xl">{value}</p>
      <p className="mt-2 text-[13px] text-cream/70">{label}</p>
    </div>
  );
}

function WhyRow({ no, title, body }: { no: string; title: string; body: string }) {
  return (
    <div className="spec-row grid-cols-[64px_1fr] items-baseline border-t-2 border-dotted border-ink/40 md:grid-cols-[96px_320px_1fr]">
      <span className="font-display text-2xl font-bold text-ochre-deep">{no}</span>
      <h3 className="font-display text-2xl font-bold tracking-tight">{title}</h3>
      <p className="col-span-2 max-w-xl text-[14px] leading-[1.9] text-ink/70 md:col-span-1">{body}</p>
    </div>
  );
}

function PriceRow({ size, name, desc, rent, last }: { size: string; name: string; desc: string; rent: string | null; last?: boolean }) {
  return (
    <div
      className={`spec-row grid-cols-[72px_1fr_auto] items-baseline border-t-2 border-dotted border-ink/40 ${
        last ? "border-b-2" : ""
      }`}
    >
      <span className="font-mono text-sm font-semibold tracking-[0.2em] text-ochre-deep">{size}</span>
      <div>
        <h3 className="font-display text-2xl font-bold tracking-tight">{name}</h3>
        <p className="mt-1 text-[13px] text-ink/60">{desc}</p>
      </div>
      <p className="font-mono text-2xl font-semibold tracking-tight">
        {rent ?? "—"}
        <span className="ml-1 text-[12px] font-normal text-ink/50">/月 起</span>
      </p>
    </div>
  );
}

function Step({ no, title, body }: { no: string; title: string; body: string }) {
  return (
    <div className="border-t-2 border-ink pt-6">
      <p className="font-display text-6xl font-black leading-none text-ochre">{no}</p>
      <h3 className="font-display mt-5 text-xl font-bold tracking-tight">{title}</h3>
      <p className="mt-3 text-[13.5px] leading-[1.85] text-ink/70">{body}</p>
    </div>
  );
}
