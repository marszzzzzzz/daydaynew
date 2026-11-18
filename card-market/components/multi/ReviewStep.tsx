'use client';
// Last step of 一相多卡: every confirmed card is cut out (front, and its paired back if any) and read on the
// phone, one after another; name, number, language and — from a player card's back — publisher and year
// are filled in as each reading finishes. The person checks, prices and saves all, both photos per card.
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useSWRConfig } from 'swr';
import { TagPicker } from '@/components/TagPicker';
import { Button, ButtonLink, Field, Input, Notice, Panel, Select } from '@/components/ui';
import { api } from '@/lib/api';
import { CARD_LANGUAGES, CONDITIONS, clampInt, sellerReady } from '@/lib/cards';
import { cropCard, type Shot } from '@/lib/detect';
import { useConfig, useMe } from '@/lib/hooks';
import { useT } from '@/lib/i18n';
import { joinNotes } from '@/lib/meta';
import { readText, type OcrResult } from '@/lib/ocr';
import { readPlayerCard } from '@/lib/sports';
import type { CardLanguage, Condition, RealCard } from '@/lib/types';

interface Item {
  blob: Blob; url: string;
  back: { blob: Blob; url: string } | null;
  ocr: OcrResult | null; ocrBack: OcrResult | null; reading: boolean; failed: boolean;
  name: string; number: string; setName: string; language: CardLanguage; condition: Condition; categoryId: string;
  asking: string; quantity: string; listed: string; isPublic: boolean; tags: string[]; notes: string;
  savedId: string | null; photoUp: boolean; backUp: boolean; listedDone: boolean; error: string | null;
}
const priceOrNull = (s: string) => (s.trim() === '' ? null : Number(s));
const done = (x: Item) => !!x.savedId && x.photoUp && (!x.back || x.backUp) && (!x.isPublic || x.listedDone);

export function ReviewStep({ front, back, pairs, onRestart }: { front: Shot; back: Shot | null; pairs: number[]; onRestart: () => void }) {
  const { t, errorText } = useT();
  const { me } = useMe();
  const config = useConfig();
  const { mutate } = useSWRConfig();
  const ready = sellerReady(me);
  const [items, setItems] = useState<Item[]>([]);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const ref = useRef<Item[]>([]);
  const set = (i: number, patch: Partial<Item> | ((x: Item) => Partial<Item>)) => setItems((all) => {
    const next = all.map((x, j) => (j === i ? { ...x, ...(typeof patch === 'function' ? patch(x) : patch) } : x));
    ref.current = next;
    return next;
  });

  // Cut the cards out, then read them one by one (the reading engine does one job at a time).
  useEffect(() => {
    let live = true;
    const urls: string[] = [];
    (async () => {
      const cut = await Promise.all(front.boxes.map((b) => cropCard(front.img, b)));
      const cutBack = await Promise.all(front.boxes.map((_, i) => (back && pairs[i] >= 0 && back.boxes[pairs[i]] ? cropCard(back.img, back.boxes[pairs[i]]) : null)));
      if (!live) return;
      const keep = (blob: Blob) => { const url = URL.createObjectURL(blob); urls.push(url); return url; };
      const first: Item[] = cut.map((blob, i) => ({
        blob, url: keep(blob), back: cutBack[i] ? { blob: cutBack[i]!, url: keep(cutBack[i]!) } : null,
        ocr: null, ocrBack: null, reading: true, failed: false, name: '', number: '', setName: '', language: 'en', condition: 'NEAR_MINT', categoryId: '',
        asking: '', quantity: '1', listed: '1', isPublic: ready, tags: [], notes: '', savedId: null, photoUp: false, backUp: false, listedDone: false, error: null,
      }));
      ref.current = first;
      setItems(first);
      for (let i = 0; i < cut.length; i++) {
        try {
          const r = await readText(cut[i], 'auto');
          const rb = cutBack[i] ? await readText(cutBack[i]!, 'auto').catch(() => null) : null;
          if (!live) return;
          // A player card's back has the number at the top and the publisher and year at the bottom.
          const pc = readPlayerCard(r.layout, rb?.layout ?? []);
          set(i, (x) => ({
            ocr: r, ocrBack: rb, reading: false, language: r.language,
            number: x.number || pc.number || r.numbers[0] || rb?.numbers[0] || '',
            name: x.name || pc.name || r.lines[0] || '',
            notes: x.notes || pc.note || '',
          }));
        } catch {
          if (live) set(i, { reading: false, failed: true });
        }
      }
    })();
    return () => { live = false; urls.forEach((u) => URL.revokeObjectURL(u)); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per confirmed set of cards
  }, [front, back, pairs]);

  // Photos exist only in this page until saved.
  const unsaved = items.some((x) => !done(x));
  useEffect(() => {
    if (!unsaved) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsaved]);

  async function saveAll() {
    setSaving(true);
    const todo = ref.current.map((x, i) => [x, i] as const).filter(([x]) => !done(x));
    for (const [n, [x0, i]] of todo.entries()) {
      setProgress(t('multi.saving', { done: n, total: todo.length }));
      const x = ref.current[i] ?? x0;
      set(i, { error: null });
      try {
        if (x.name.trim().length < 2) throw new Error(t('form.nameShort'));
        if (x.isPublic && priceOrNull(x.asking) === null) throw new Error(t('err.NEEDS_PRICE'));
        const quantity = clampInt(x.quantity, 1, 999);
        const fields = {
          name: x.name.trim(), setName: x.setName, number: x.number, language: x.language, condition: x.condition, categoryId: x.categoryId || null,
          quantity, askingPrice: priceOrNull(x.asking), listedQuantity: clampInt(x.listed, 0, quantity),
          notes: joinNotes({ tags: x.tags, serial: '', text: x.notes }),
        };
        let id = x.savedId;
        if (!id) {
          const ocrText = [x.ocr?.text, x.ocrBack?.text].filter(Boolean).join('\n').slice(0, 4000);
          id = (await api<RealCard>('real-cards', { body: { ...fields, ocrText, source: ocrText ? 'OCR' : 'MANUAL' } })).id;
          set(i, { savedId: id });
        } else {
          await api(`real-cards/${encodeURIComponent(id)}`, { method: 'PATCH', body: fields });
        }
        if (!ref.current[i].photoUp) {
          await api(`real-cards/${encodeURIComponent(id)}/photos/front`, { method: 'PUT', body: x.blob });
          set(i, { photoUp: true });
        }
        if (x.back && !ref.current[i].backUp) {
          await api(`real-cards/${encodeURIComponent(id)}/photos/back`, { method: 'PUT', body: x.back.blob });
          set(i, { backUp: true });
        }
        if (ref.current[i].isPublic && !ref.current[i].listedDone) {
          await api(`real-cards/${encodeURIComponent(id)}/market`, { body: { public: true } });
          set(i, { listedDone: true });
        }
      } catch (e) {
        set(i, { error: errorText(e) });
      }
    }
    setProgress(null);
    setSaving(false);
    await Promise.all([mutate('real-cards'), mutate('me'), mutate((k) => typeof k === 'string' && k.startsWith('real-market'))]);
  }

  const reading = items.filter((x) => x.reading).length;
  const saved = items.filter(done).length;
  const failed = items.filter((x) => x.error).length;
  const categories = config?.categories.filter((c) => c.active) ?? [];
  const currency = config?.config.realCards.currency ?? 'HKD';

  return (
    <div className="pb-28">
      {!ready && (
        <Notice tone="warn" className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <span>{t('batch.notReady')}</span>
          <ButtonLink href="/account" variant="secondary">{t('sell.ready.fix')}</ButtonLink>
        </Notice>
      )}
      {reading > 0 && <Notice className="mb-4">⏳ {t('multi.reading', { n: items.length - reading, total: items.length })}</Notice>}

      <ol className="space-y-4">
        {items.map((x, i) => {
          const locked = saving || done(x);
          return (
            <li key={x.url}>
              <Panel className={done(x) ? 'opacity-80' : ''}>
                <div className="flex gap-4">
                  <div className="flex shrink-0 flex-col gap-1.5">
                    {([[x.url, 'FRONT'], [x.back?.url, 'BACK']] as const).map(([u, s]) => (
                      <figure key={s} className="w-20">
                        <div className="aspect-[63/88] overflow-hidden rounded-lg bg-surface-2">
                          {u ? <img src={u} alt={`#${i + 1} ${t(`side.${s}`)}`} className="size-full object-cover" /> : <span className="grid size-full place-items-center text-[10px] text-muted">{t('batch.noBack')}</span>}
                        </div>
                        <figcaption className="text-center text-[10px] text-muted">{t(`side.${s}`)}</figcaption>
                      </figure>
                    ))}
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="font-bold">#{i + 1} {x.name || <span className="font-normal text-muted">{t('batch.unnamed')}</span>}</h2>
                      {done(x) && <span className="text-sm font-semibold text-ok">✓ {t('batch.savedOne')}</span>}
                    </div>
                    {x.reading ? <p className="text-sm text-muted">⏳ {t('batch.reading')}</p>
                      : x.failed || !x.ocr?.text ? <p className="text-sm text-muted">{t('batch.noText')}</p>
                      : (
                        <div className="flex flex-wrap gap-1.5">
                          {[...new Set([...x.ocr.numbers, ...(x.ocrBack?.numbers ?? [])])].map((nm) => <Chip key={`n:${nm}`} strong disabled={locked} onClick={() => set(i, { number: nm })}>#{nm}</Chip>)}
                          {[...new Set([...x.ocr.lines.slice(0, 8), ...(x.ocrBack?.lines.slice(0, 6) ?? [])])].map((l) => <Chip key={`l:${l}`} disabled={locked} onClick={() => set(i, { name: l.slice(0, 80) })}>{l}</Chip>)}
                        </div>
                      )}
                    <p className="text-xs text-muted">{t('multi.chipHint')}</p>
                  </div>
                </div>
                {x.error && <Notice tone="danger" className="mt-3">{x.error}</Notice>}
                <div className="mt-3 grid grid-cols-2 gap-3 xl:grid-cols-4">
                  <Field className="col-span-2" label={t('form.name')}><Input value={x.name} maxLength={80} disabled={locked} onChange={(e) => set(i, { name: e.target.value })} /></Field>
                  <Field label={t('field.number')}><Input value={x.number} maxLength={24} disabled={locked} onChange={(e) => set(i, { number: e.target.value })} /></Field>
                  <Field label={t('field.set')}><Input value={x.setName} maxLength={60} disabled={locked} onChange={(e) => set(i, { setName: e.target.value })} /></Field>
                  <Field label={t('field.language')}>
                    <Select value={x.language} disabled={locked} onChange={(e) => set(i, { language: e.target.value as CardLanguage })}>
                      {CARD_LANGUAGES.map((l) => <option key={l} value={l}>{t(`clang.${l}`)}</option>)}
                    </Select>
                  </Field>
                  <Field label={t('field.category')}>
                    <Select value={x.categoryId} disabled={locked} onChange={(e) => set(i, { categoryId: e.target.value })}>
                      <option value="">{t('form.category.none')}</option>
                      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </Select>
                  </Field>
                  <Field label={t('field.condition')}>
                    <Select value={x.condition} disabled={locked} onChange={(e) => set(i, { condition: e.target.value as Condition })}>
                      {CONDITIONS.map((c) => <option key={c} value={c}>{t(`cond.${c}`)}</option>)}
                    </Select>
                  </Field>
                  <Field label={t('form.asking', { cur: currency })}>
                    <Input type="number" inputMode="decimal" min={0} step="0.01" value={x.asking} disabled={locked} onChange={(e) => set(i, { asking: e.target.value })} />
                  </Field>
                  <Field label={t('form.quantity')}>
                    <Input type="number" inputMode="numeric" min={1} max={999} value={x.quantity} disabled={locked} onChange={(e) => set(i, { quantity: e.target.value })} />
                  </Field>
                  <Field label={t('form.listed')}>
                    <Input type="number" inputMode="numeric" min={0} max={999} value={x.listed} disabled={locked} onChange={(e) => set(i, { listed: e.target.value })} />
                  </Field>
                  <Field className="col-span-2" label={t('form.notes')}><Input value={x.notes} maxLength={300} disabled={locked} onChange={(e) => set(i, { notes: e.target.value })} /></Field>
                </div>
                <div className="mt-3"><TagPicker tags={x.tags} onChange={(tags) => set(i, { tags })} disabled={locked} /></div>
                <label className={`mt-3 flex items-center gap-2 text-sm ${!ready ? 'opacity-50' : ''}`}>
                  <input type="checkbox" className="size-4 accent-[var(--brand)]" checked={x.isPublic} disabled={!ready || locked} onChange={(e) => set(i, { isPublic: e.target.checked })} />
                  {t('form.public')}
                </label>
              </Panel>
            </li>
          );
        })}
      </ol>

      <div className="fixed inset-x-0 bottom-[60px] z-30 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur sm:bottom-0">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <span className="text-sm">
            {progress ? <b>{progress}</b>
              : saved === items.length && items.length ? <b className="text-ok">{t('batch.allSaved', { n: saved })}</b>
              : <>{t('batch.summary', { n: items.length - saved })}{failed ? <span className="text-danger"> · {t('batch.failed', { n: failed })}</span> : null}</>}
          </span>
          {saved === items.length && items.length ? (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={onRestart}>📷 {t('multi.another')}</Button>
              <ButtonLink href="/sell">{t('batch.toMyCards')}</ButtonLink>
            </div>
          ) : (
            <Button busy={saving} disabled={!items.length || reading > 0} onClick={saveAll}>{failed ? t('batch.retry') : t('batch.saveAll', { n: items.length - saved })}</Button>
          )}
        </div>
      </div>
      <p className="mt-6 text-center text-sm"><Link href="/sell" className="text-muted hover:text-ink">← {t('nav.sell')}</Link></p>
    </div>
  );
}

const Chip = ({ children, onClick, strong, disabled }: { children: ReactNode; onClick: () => void; strong?: boolean; disabled?: boolean }) => (
  <button type="button" onClick={onClick} disabled={disabled}
    className={`max-w-full truncate rounded-full border px-2.5 py-1 text-sm hover:border-brand disabled:opacity-50 ${strong ? 'border-brand/40 bg-brand/10 font-semibold' : 'border-line bg-surface-2'}`}>
    {children}
  </button>
);
