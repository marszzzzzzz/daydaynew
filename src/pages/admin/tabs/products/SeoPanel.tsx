import { parseKeywords, seoChecks, seoScore, type SeoInput } from "@contracts/products";

const SITE_HOST = "daydaynew.trize.shop";

/** 分數 + 逐項檢查 + Google 搜尋結果預覽 + AI 搜尋引用預覽 */
export default function SeoPanel({ seo, price }: { seo: SeoInput; price: string | null }) {
  const checks = seoChecks(seo);
  const score = seoScore(seo);
  const name = seo.displayName.trim() || seo.sourceName;
  const desc = seo.description.trim();
  const keyword = parseKeywords(seo.keywords)[0];
  const priceText = price ? `（HK$${Number(price).toFixed(0)}）` : "";

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <p className="font-mono text-4xl font-semibold tracking-tight">{score}</p>
        <div className="flex-1">
          <p className="spec-label">SEO 分數</p>
          <div className="mt-1.5 h-1.5 bg-ink/10">
            <div className={`h-full transition-[width] duration-300 ${score === 100 ? "bg-ink" : "bg-ochre"}`} style={{ width: `${score}%` }} />
          </div>
        </div>
      </div>

      <ul className="space-y-1.5 text-[12.5px]">
        {checks.map((c) => (
          <li key={c.id} className="flex gap-2">
            <span className={`font-mono ${c.ok ? "text-ink" : "text-ochre-deep"}`} aria-hidden="true">
              {c.ok ? "✓" : "○"}
            </span>
            <span>
              <span className={c.ok ? "text-ink/55" : "font-semibold"}>{c.label}</span>
              {!c.ok && <span className="block text-ink/55">{c.hint}</span>}
            </span>
          </li>
        ))}
      </ul>

      <div className="border border-ink/20 bg-white/60 p-4">
        <p className="spec-label mb-2">Google 搜尋結果預覽 · SEO / SEM</p>
        <p className="truncate text-[12px] text-ink/55">{SITE_HOST} › 店內好物</p>
        <p className="mt-0.5 truncate text-[17px] leading-snug text-[#1a0dab]">{name} | 日日新格仔鋪 北角</p>
        <p className="mt-1 line-clamp-2 text-[13px] leading-[1.6] text-ink/70">{desc || <span className="text-ink/40">（未有描述，Google 會喺頁面自己揀一段字）</span>}</p>
      </div>

      <div className="border border-ink/20 bg-white/60 p-4">
        <p className="spec-label mb-2">AI 搜尋引用預覽 · GEO / AEO</p>
        <p className="text-[12.5px] text-ink/55">問：「{keyword ? `${keyword}喺北角邊度買？` : "（加關鍵字之後會見到客人點問）"}」</p>
        <p className="mt-1.5 text-[13px] leading-[1.7]">
          答：北角嘅日日新格仔鋪有「{name}」{priceText}。{desc}
        </p>
      </div>
    </div>
  );
}
