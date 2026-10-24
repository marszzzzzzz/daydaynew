import { Link } from "react-router";

export type BannerView = { title: string; body: string; linkUrl: string; linkLabel: string };

/** 橫幅外觀（訪客頁同後台預覽共用）；onClose 冇傳 = 唔顯示關閉掣 */
export default function BannerCard({ banner, onClose }: { banner: BannerView; onClose?: () => void }) {
  const external = /^(https?|whatsapp):/i.test(banner.linkUrl);
  const cta = "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap bg-ochre px-4 py-2.5 text-[13.5px] font-semibold text-ink transition-transform hover:-translate-y-0.5";

  return (
    <div
      className="relative flex flex-col gap-3 border-2 border-ink bg-ink p-4 pr-11 text-cream sm:flex-row sm:items-center sm:gap-5 sm:p-5 sm:pr-12"
      style={{ boxShadow: "6px 6px 0 0 rgba(179,156,79,1)" }}
    >
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.2em] text-ochre">
          <span className="ob-ring inline-block h-1.5 w-1.5 rounded-full bg-ochre" aria-hidden="true" />
          最新宣傳 · Latest
        </p>
        <p className="font-display mt-1.5 break-words text-[19px] font-black leading-snug tracking-tight">{banner.title || "（未有標題）"}</p>
        {banner.body && <p className="mt-1 whitespace-pre-line break-words text-[13.5px] leading-[1.75] text-cream/75">{banner.body}</p>}
      </div>
      {banner.linkUrl && banner.linkLabel &&
        (external ? (
          <a href={banner.linkUrl} target="_blank" rel="noopener noreferrer" className={cta}>
            {banner.linkLabel} <span aria-hidden="true">↗</span>
          </a>
        ) : (
          <Link to={banner.linkUrl} className={cta}>
            {banner.linkLabel} <span aria-hidden="true">→</span>
          </Link>
        ))}
      {onClose && (
        <button
          onClick={onClose}
          aria-label="關閉宣傳"
          className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center text-[18px] leading-none text-cream/60 transition-colors hover:text-cream"
        >
          ×
        </button>
      )}
    </div>
  );
}
