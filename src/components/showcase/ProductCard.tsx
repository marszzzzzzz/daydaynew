import type { ShowcaseCard } from "@contracts/products";
import { whatsappProductLink } from "@/const";

/** 卡闊（px）：手機 150、大畫面 200；相片 1:1 */
export const CARD_CLASS = "w-[150px] shrink-0 sm:w-[200px]";

function Placeholder({ name, category }: { name: string; category: string }) {
  return (
    <div className="flex h-full w-full flex-col justify-between bg-ochre/15 p-3" aria-hidden="true">
      <span className="self-end font-mono text-[10px] uppercase tracking-[0.18em] text-ochre-deep">{category || "DayDayNew"}</span>
      <span className="font-display text-[44px] font-black leading-none text-ochre-deep/70 sm:text-[56px]">{[...name][0]}</span>
    </div>
  );
}

/** 一張商品卡；撳落去 WhatsApp 查詢呢件貨。duplicate = 跑馬燈複本（讀屏同 Tab 鍵略過） */
export default function ProductCard({ product, rank, duplicate }: { product: ShowcaseCard; rank?: number; duplicate?: boolean }) {
  const price = product.price ? `HK$${Number(product.price).toFixed(0)}` : null;
  return (
    <a
      href={whatsappProductLink(product.name)}
      target="_blank"
      rel="noopener noreferrer"
      tabIndex={duplicate ? -1 : undefined}
      className={`group/card block ${CARD_CLASS}`}
      title={product.description || product.name}
    >
      <div className="relative aspect-square overflow-hidden border border-ink/20 bg-cream-2">
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            width={400}
            height={400}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover/card:scale-[1.04]"
          />
        ) : (
          <Placeholder name={product.name} category={product.category} />
        )}
        {rank !== undefined && (
          <span className="absolute left-0 top-0 bg-ink px-2 py-1 font-mono text-[11px] font-semibold text-cream">#{rank}</span>
        )}
      </div>
      <p className="mt-2.5 line-clamp-2 min-h-[2.6em] text-[13.5px] font-semibold leading-[1.3] underline-offset-4 group-hover/card:underline">{product.name}</p>
      <p className="mt-1 font-mono text-[12px] text-ink/60">{price ?? "WhatsApp 查詢"}</p>
    </a>
  );
}
