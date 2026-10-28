import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { BANNER_BODY_MAX, BANNER_TITLE_MAX } from "@contracts/banner";
import { PRODUCT_DESC_MAX, PRODUCT_NAME_MAX } from "@contracts/products";
import { ActionButton, Field } from "../../ui";
import type { FbPostRow } from "./FacebookTab";

const clip = (s: string, max: number) => [...s.trim()].slice(0, max).join("");
const input = "underline-input";

function useDone(onDone: () => void, message: string) {
  const utils = trpc.useUtils();
  return {
    onSuccess: () => {
      toast.success(message);
      void utils.facebook.invalidate();
      void utils.products.invalidate();
      void utils.banner.invalidate();
      onDone();
    },
    onError: (e: { message: string }) => toast.error(e.message),
  };
}

/** 新貨帖 → 商品：預先填好 AI / 規則抽出嚟嘅名同價，店主改完先儲存 */
export function ApplyProductForm({ post, onDone }: { post: FbPostRow; onDone: () => void }) {
  const first = post.insight.products[0];
  const [f, setF] = useState({
    sourceName: first?.name ?? clip(post.insight.summary, PRODUCT_NAME_MAX),
    displayName: clip(first?.name ?? "", PRODUCT_NAME_MAX),
    description: clip(post.insight.summary, PRODUCT_DESC_MAX),
    price: first?.price != null ? String(first.price) : "",
    useImage: !!post.imageUrl,
    featured: true,
  });
  const known = trpc.products.list.useQuery({ limit: 200 });
  const apply = trpc.facebook.applyProduct.useMutation(useDone(onDone, "已更新商品資料"));
  const price = f.price.trim() === "" ? null : Number(f.price);
  const invalid = !f.sourceName.trim() ? "請輸入貨品名稱" : price !== null && (!Number.isFinite(price) || price < 0) ? "售價要係正數" : null;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (invalid) return toast.error(invalid);
        apply.mutate({ id: post.id, sourceName: f.sourceName, displayName: f.displayName, description: f.description, listPrice: price, useImage: f.useImage, featured: f.featured });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="貨品（POS 名）">
          <input className={input} list={`pos-names-${post.id}`} value={f.sourceName} onChange={(e) => setF({ ...f, sourceName: e.target.value })} />
          <datalist id={`pos-names-${post.id}`}>
            {known.data?.rows.map((r) => <option key={r.sourceName} value={r.sourceName} />)}
          </datalist>
          <span className="text-[11px] text-ink/45">POS 賣過嘅貨就揀返原名，銷量同熱銷先對得上</span>
        </Field>
        <Field label="對外名稱（SEO）">
          <input className={input} value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} placeholder="留空 = 用 POS 名" />
        </Field>
      </div>
      <Field label="描述">
        <textarea className={`${input} min-h-[60px] resize-y`} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      </Field>
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3 text-[13.5px]">
        <Field label="對外售價（HK$）">
          <input className={`${input} w-28 font-mono`} inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} placeholder="POS 價" />
        </Field>
        {post.imageUrl && (
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" className="h-4 w-4 accent-[#1D1D1D]" checked={f.useImage} onChange={(e) => setF({ ...f, useImage: e.target.checked })} />
            用帖文相做商品相
          </label>
        )}
        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" className="h-4 w-4 accent-[#1D1D1D]" checked={f.featured} onChange={(e) => setF({ ...f, featured: e.target.checked })} />
          放入首頁精選
        </label>
      </div>
      <div className="flex items-center gap-3">
        <ActionButton tone="ochre" disabled={apply.isPending || !!invalid}>
          {apply.isPending ? "儲存中…" : "確認更新商品"}
        </ActionButton>
        {invalid && <span className="text-[12px] text-red-800">{invalid}</span>}
      </div>
    </form>
  );
}

/** 活動帖 → 首頁「最新宣傳」橫幅（會取代而家嘅橫幅） */
export function ApplyBannerForm({ post, onDone }: { post: FbPostRow; onDone: () => void }) {
  const body = post.message.split("\n").slice(1).join(" ").trim() || post.message;
  const [f, setF] = useState({
    title: clip(post.insight.summary, BANNER_TITLE_MAX),
    body: clip(body, BANNER_BODY_MAX),
    startDate: post.insight.eventStart,
    endDate: post.insight.eventEnd,
  });
  const apply = trpc.facebook.applyBanner.useMutation(useDone(onDone, "已更新首頁宣傳橫幅"));

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        apply.mutate({ id: post.id, ...f });
      }}
    >
      <Field label={`標題（最多 ${BANNER_TITLE_MAX} 字）`}>
        <input className={input} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
      </Field>
      <Field label={`內容（最多 ${BANNER_BODY_MAX} 字）`}>
        <textarea className={`${input} min-h-[60px] resize-y`} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="開始日期（可留空）">
          <input type="date" className={`${input} font-mono`} value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} />
        </Field>
        <Field label="結束日期（可留空）">
          <input type="date" className={`${input} font-mono`} value={f.endDate} min={f.startDate || undefined} onChange={(e) => setF({ ...f, endDate: e.target.value })} />
        </Field>
      </div>
      <p className="text-[12px] text-ink/55">會取代而家首頁嘅宣傳橫幅；按鈕「睇 Facebook 帖文」會連去呢篇帖。</p>
      <ActionButton tone="ochre" disabled={apply.isPending || !f.title.trim()}>
        {apply.isPending ? "儲存中…" : "確認轉做宣傳橫幅"}
      </ActionButton>
    </form>
  );
}
