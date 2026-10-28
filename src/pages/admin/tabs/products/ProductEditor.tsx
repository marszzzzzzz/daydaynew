import { useRef, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { compressImage } from "@/lib/imageResize";
import ProductCard from "@/components/showcase/ProductCard";
import { PRODUCT_CATEGORY_MAX, PRODUCT_DESC_MAX, PRODUCT_KEYWORDS_MAX, PRODUCT_NAME_MAX, productInputSchema, publicName } from "@contracts/products";
import { ActionButton, Field } from "../../ui";
import SeoPanel from "./SeoPanel";
import type { ProductListRow } from "./ProductsTab";

function Counter({ value, max }: { value: string; max: number }) {
  const n = [...value].length;
  return <span className={`font-mono text-[10.5px] ${n > max ? "text-red-800" : "text-ink/40"}`}>{n}/{max}</span>;
}

/** 單件貨品嘅 SEO 編輯：左邊填資料，右邊即時睇分數、搜尋預覽、首頁卡 */
export default function ProductEditor({ row, onClose }: { row: ProductListRow; onClose: () => void }) {
  const utils = trpc.useUtils();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    displayName: row.displayName,
    description: row.description,
    keywords: row.keywords,
    category: row.category,
    latest: row.latest,
    bestSeller: row.bestSeller,
    hidden: row.hidden,
  });
  const [imageUrl, setImageUrl] = useState(row.imageUrl);
  const [priceText, setPriceText] = useState(row.listPrice !== null ? String(Number(row.listPrice)) : "");
  const [compressing, setCompressing] = useState(false);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((prev) => ({ ...prev, [k]: v }));
  /** 隱藏同首頁位置互斥：剔隱藏就退出兩行，剔任何一行就取消隱藏 */
  const place = (k: "latest" | "bestSeller" | "hidden", on: boolean) =>
    setForm((prev) => (k === "hidden" ? { ...prev, hidden: on, ...(on && { latest: false, bestSeller: false }) } : { ...prev, [k]: on, ...(on && { hidden: false }) }));

  const save = trpc.products.save.useMutation({
    onSuccess: () => {
      toast.success("已儲存");
      void utils.products.invalidate();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });
  const setImage = trpc.products.setImage.useMutation({
    onSuccess: (r) => {
      setImageUrl(r.imageUrl);
      toast.success(r.imageUrl ? "相片已上載" : "相片已刪除");
      void utils.products.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const listPrice = priceText.trim() === "" ? null : Number(priceText);
  const priceError = listPrice !== null && !Number.isFinite(listPrice) ? "售價要係數字" : null;
  const input = { sourceName: row.sourceName, ...form, listPrice: priceError ? null : listPrice };
  const parsed = productInputSchema.safeParse(input);
  const firstError = priceError ?? (parsed.success ? null : parsed.error.issues[0].message);
  const shownPrice = listPrice !== null && !priceError ? listPrice.toFixed(2) : row.posPrice;
  const busy = save.isPending || setImage.isPending || compressing;

  const onFile = async (file: File) => {
    setCompressing(true);
    try {
      setImage.mutate({ sourceName: row.sourceName, image: await compressImage(file) });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "相片處理失敗");
    } finally {
      setCompressing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="border-2 border-ink bg-cream p-5 sm:p-6" style={{ boxShadow: "6px 6px 0 0 rgba(179,156,79,1)" }}>
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-mono text-[11px] text-ink/55">
          POS 名：<b className="text-ink">{row.sourceName}</b>（銷售記錄同租戶報表照用呢個名，唔受影響）
        </p>
        <button onClick={onClose} className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink/50 underline-offset-4 hover:underline">
          關閉
        </button>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1.15fr_1fr]">
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (firstError) return toast.error(firstError);
            save.mutate(input);
          }}
        >
          <Field label="對外名稱（SEO 標題）">
            <input className="underline-input" value={form.displayName} onChange={(e) => set("displayName", e.target.value)} placeholder={row.sourceName} />
            <Counter value={form.displayName} max={PRODUCT_NAME_MAX} />
          </Field>
          <Field label="描述（一兩句：係乜、適合邊個、喺邊度買到）">
            <textarea
              className="underline-input min-h-[84px] resize-y"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="例如：韓國 Neoflam 陶瓷保鮮盒 900ml，可入焗爐同雪櫃，北角日日新格仔鋪有現貨。"
            />
            <Counter value={form.description} max={PRODUCT_DESC_MAX} />
          </Field>
          <div className="grid gap-5 sm:grid-cols-[1.6fr_1fr_0.9fr]">
            <Field label="關鍵字（逗號分隔）">
              <input className="underline-input" value={form.keywords} onChange={(e) => set("keywords", e.target.value)} placeholder="保鮮盒, Neoflam, 北角" />
              <Counter value={form.keywords} max={PRODUCT_KEYWORDS_MAX} />
            </Field>
            <Field label="分類">
              <input className="underline-input" value={form.category} onChange={(e) => set("category", e.target.value)} placeholder="廚具" />
              <Counter value={form.category} max={PRODUCT_CATEGORY_MAX} />
            </Field>
            <Field label="對外售價 HK$">
              <input
                className="underline-input font-mono"
                inputMode="decimal"
                value={priceText}
                onChange={(e) => setPriceText(e.target.value)}
                placeholder={row.posPrice ? `POS ${Number(row.posPrice)}` : "留空"}
              />
            </Field>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-3 text-[13.5px]">
            <label className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" className="h-4 w-4 accent-[#1D1D1D]" checked={form.bestSeller} onChange={(e) => place("bestSeller", e.target.checked)} />
              放入首頁「熱銷產品」
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" className="h-4 w-4 accent-[#1D1D1D]" checked={form.latest} onChange={(e) => place("latest", e.target.checked)} />
              放入首頁「最新商品」
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" className="h-4 w-4 accent-[#1D1D1D]" checked={form.hidden} onChange={(e) => place("hidden", e.target.checked)} />
              唔喺首頁出現（隱藏）
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-ink/15 pt-5">
            <ActionButton tone="ochre" disabled={busy || !!firstError}>
              {save.isPending ? "儲存中…" : "儲存"}
            </ActionButton>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
            <ActionButton tone="ghost" disabled={busy} onClick={() => fileRef.current?.click()}>
              {compressing ? "壓縮中…" : setImage.isPending ? "上載中…" : imageUrl ? "換相" : "上載相片"}
            </ActionButton>
            {imageUrl && (
              <button type="button" disabled={busy} onClick={() => setImage.mutate({ sourceName: row.sourceName, image: null })} className="px-1 text-[12px] text-ink/55 underline-offset-2 hover:underline">
                刪除相片
              </button>
            )}
            {firstError && <span className="text-[12.5px] text-red-800">{firstError}</span>}
          </div>
          <p className="text-[11.5px] leading-[1.8] text-ink/45">相片會自動壓縮成網頁大小（約 800px），即時生效，唔使撳儲存。建議用正方形、白底或者淨色背景。</p>
        </form>

        <div className="space-y-6">
          <div>
            <p className="spec-label mb-2">首頁卡預覽</p>
            <div className="pointer-events-none" aria-hidden="true">
              <ProductCard product={{ name: publicName({ sourceName: row.sourceName, displayName: form.displayName }), description: form.description, category: form.category, price: shownPrice, imageUrl }} />
            </div>
          </div>
          <SeoPanel seo={{ sourceName: row.sourceName, displayName: form.displayName, description: form.description, keywords: form.keywords, hasImage: !!imageUrl }} price={shownPrice} />
        </div>
      </div>
    </div>
  );
}
