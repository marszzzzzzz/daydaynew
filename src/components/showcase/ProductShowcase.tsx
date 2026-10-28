import type { CSSProperties } from "react";
import { trpc } from "@/providers/trpc";
import { safeJsonLd, showcaseJsonLd, type ShowcaseCard } from "@contracts/products";
import ProductCard from "./ProductCard";

/** 少過呢個數唔郁（太少件會見到同一件貨重複出現） */
const MIN_TO_ANIMATE = 4;
/** 每輪最少幾多張卡，闊過大畫面先唔會喺循環接駁位露出空位 */
const MIN_LOOP_CARDS = 8;
/** 每張卡行幾耐（秒）；第二行慢少少，兩行唔會同步 */
const SECONDS_PER_CARD = { latest: 4.5, best: 5.2 };

function repeatToFill<T>(items: T[]): T[] {
  const times = Math.ceil(MIN_LOOP_CARDS / items.length);
  return Array.from({ length: times }, () => items).flat();
}

function MarqueeRow({ id, label, sub, items, ranked, secondsPerCard }: { id: string; label: string; sub: string; items: ShowcaseCard[]; ranked?: boolean; secondsPerCard: number }) {
  const animate = items.length >= MIN_TO_ANIMATE;
  const loop = animate ? repeatToFill(items) : items;
  const style = { "--pd-duration": `${loop.length * secondsPerCard}s` } as CSSProperties;
  const cards = (dup: boolean) =>
    loop.map((p, i) => (
      <li key={`${dup ? "d" : "o"}${i}`} className={dup ? "pd-dup" : undefined} aria-hidden={dup || i >= items.length || undefined}>
        <ProductCard product={p} rank={ranked ? (i % items.length) + 1 : undefined} duplicate={dup || i >= items.length} />
      </li>
    ));

  return (
    <div>
      <div className="mx-auto mb-4 flex max-w-6xl items-baseline gap-3 px-5">
        <h3 id={id} className="font-display text-xl font-black tracking-tight sm:text-2xl">
          {label}
        </h3>
        <span className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-ink/45">{sub}</span>
      </div>
      <div
        className={`pd-row overflow-hidden ${animate ? "[mask-image:linear-gradient(to_right,transparent,black_5%,black_95%,transparent)]" : "mx-auto max-w-6xl overflow-x-auto px-5"}`}
      >
        <ul aria-labelledby={id} className={`flex w-max gap-4 sm:gap-5 ${animate ? "pd-track" : ""}`} style={animate ? style : undefined}>
          {cards(false)}
          {animate && cards(true)}
        </ul>
      </div>
    </div>
  );
}

/**
 * 首頁「店內好物」：上面最新商品（Facebook 帖文帶入）、下面熱銷產品（店主喺後台 14 揀），自動向左循環移動。
 * 兩行都冇貨就成段唔顯示。
 */
export default function ProductShowcase() {
  const { data } = trpc.products.showcase.useQuery(undefined, { staleTime: 5 * 60_000 });
  if (!data || (data.latest.length === 0 && data.bestSellers.length === 0)) return null;

  const unique = [...new Map([...data.latest, ...data.bestSellers].map((p) => [p.name, p])).values()];
  const jsonLd = safeJsonLd(showcaseJsonLd(unique, window.location.origin));

  return (
    <section id="products" aria-labelledby="products-title" className="scroll-mt-28 border-t border-ink/15 pb-20 pt-16">
      <div className="mx-auto max-w-6xl px-5">
        <p className="spec-label mb-3">In store — 店內好物</p>
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <h2 id="products-title" className="font-display text-3xl font-black tracking-tight md:text-4xl">
            格仔入面，有乜好嘢？
          </h2>
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink/50">撳商品即刻 WhatsApp 查詢</p>
        </div>
      </div>
      <div className="mt-10 space-y-12">
        {data.latest.length > 0 && <MarqueeRow id="latest-title" label="最新商品" sub="New in" items={data.latest} secondsPerCard={SECONDS_PER_CARD.latest} />}
        {data.bestSellers.length > 0 && (
          <MarqueeRow id="best-title" label="熱銷產品" sub="Best sellers" items={data.bestSellers} ranked secondsPerCard={SECONDS_PER_CARD.best} />
        )}
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
    </section>
  );
}
