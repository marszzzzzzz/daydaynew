'use client';
// Batch review (spec §10.3): for every captured card, pick the text that names it — tap a recognised line, or
// select part of the recognised text — add the price, then save all. Saving is sequential with progress and
// retry; a card that already has a record is never created twice.
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useSWRConfig } from 'swr';
import { TagPicker } from '@/components/TagPicker';
import { Badge, Button, ButtonLink, Field, Input, Notice, Panel, Select } from '@/components/ui';
import { api } from '@/lib/api';
import { BATCH_MAX, batch, isDone, useBatch, type BatchCard } from '@/lib/batch';
import { CARD_LANGUAGES, CONDITIONS, clampInt, sellerReady } from '@/lib/cards';
import { useConfig, useMe } from '@/lib/hooks';
import { useT, type Key } from '@/lib/i18n';
import { MAX_SERIAL, cleanSerial, joinNotes, serialProblem } from '@/lib/meta';
import { OCR_LANGS, type OcrLangs } from '@/lib/ocr';
import type { CardLanguage, Condition, PhotoSide, RealCard, Suggestion } from '@/lib/types';

type Target = 'name' | 'number' | 'setName' | 'serial';
const TARGETS: Target[] = ['name', 'number', 'setName', 'serial'];
const LABEL: Record<Target, Key> = { name: 'form.name', number: 'field.number', setName: 'field.set', serial: 'tags.serial' };
const MAX_LEN: Record<Target, number> = { name: 80, number: 24, setName: 60, serial: MAX_SERIAL };
const priceOrNull = (s: string) => (s.trim() === '' ? null : Number(s));

export function BatchReview({ langs, setLangs, onCamera }: { langs: OcrLangs; setLangs: (l: OcrLangs) => void; onCamera: () => void }) {
  const { t, money, errorText } = useT();
  const cards = useBatch();
  const { me } = useMe();
  const config = useConfig();
  const { mutate } = useSWRConfig();
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const currency = config?.config.realCards.currency ?? 'HKD';
  const maxPrice = config?.config.realCards.maxPrice ?? 10_000_000;
  const ready = sellerReady(me);
  const pending = cards.filter((c) => !isDone(c));
  const total = pending.reduce((s, c) => s + (priceOrNull(c.asking) ?? 0) * clampInt(c.listed, 0, clampInt(c.quantity, 1, 999)), 0);

  async function saveOne(c: BatchCard) {
    const fresh = () => batch.get().find((x) => x.key === c.key)!;
    batch.update(c.key, { error: null });
    try {
      if (c.name.trim().length < 2) throw new Error(t('form.nameShort'));
      if (c.isPublic && priceOrNull(c.asking) === null) throw new Error(t('err.NEEDS_PRICE'));
      const serial = cleanSerial(c.serial);
      if (serialProblem(serial)) throw new Error(t('tags.serial.range'));
      const quantity = clampInt(c.quantity, 1, 999);
      const fields = {
        name: c.name.trim(), cardId: c.cardId, categoryId: c.categoryId || null, setName: c.setName, number: c.number,
        language: c.language, condition: c.condition, grade: c.grade, quantity,
        askingPrice: priceOrNull(c.asking), costPrice: priceOrNull(c.cost), listedQuantity: clampInt(c.listed, 0, quantity),
        notes: joinNotes({ tags: c.tags, serial, text: '' }),
      };
      let id = c.savedId;
      if (!id) {
        const ocrText = (['FRONT', 'BACK'] as const).map((s) => c.ocr[s]?.text ?? '').filter(Boolean).join('\n').slice(0, 4000);
        id = (await api<RealCard>('real-cards', { body: { ...fields, ocrText, source: ocrText ? 'OCR' : 'MANUAL' } })).id;
        batch.update(c.key, { savedId: id });
      } else {
        // A retry after a partial save: this flow created the record moments ago, so send the fields as they stand.
        await api(`real-cards/${encodeURIComponent(id)}`, { method: 'PATCH', body: fields });
      }
      for (const side of ['FRONT', 'BACK'] as PhotoSide[]) {
        const shot = fresh().photos[side];
        if (shot && !fresh().uploaded[side]) {
          await api(`real-cards/${encodeURIComponent(id)}/photos/${side.toLowerCase()}`, { method: 'PUT', body: shot.blob });
          batch.update(c.key, (x) => ({ uploaded: { ...x.uploaded, [side]: true } }));
        }
      }
      if (fresh().isPublic && !fresh().listedDone) {
        await api(`real-cards/${encodeURIComponent(id)}/market`, { body: { public: true } });
        batch.update(c.key, { listedDone: true });
      }
    } catch (e) {
      batch.update(c.key, { error: errorText(e) });
    }
  }

  async function saveAll() {
    const todo = batch.get().filter((c) => !isDone(c));
    setSaving(true);
    setProgress({ done: 0, total: todo.length });
    for (const [i, c] of todo.entries()) {
      await saveOne(c);
      setProgress({ done: i + 1, total: todo.length });
    }
    await Promise.all([mutate('real-cards'), mutate('me'), mutate((k) => typeof k === 'string' && k.startsWith('real-market'))]);
    setSaving(false);
  }

  const saved = cards.filter(isDone).length;
  const failed = cards.filter((c) => c.error).length;

  if (!cards.length) {
    return (
      <div className="rounded-2xl border border-dashed border-line px-6 py-14 text-center">
        <p className="text-muted">{t('batch.empty')}</p>
        <Button className="mt-4" onClick={onCamera}>📷 {t('batch.open')}</Button>
      </div>
    );
  }

  return (
    <div className="pb-28">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t('batch.reviewTitle')}</h1>
          <p className="mt-1 text-sm text-muted">{t('batch.reviewSub', { n: cards.length, max: BATCH_MAX })}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <span className="whitespace-nowrap">{t('batch.ocrLang')}</span>
            <Select value={langs} onChange={(e) => setLangs(e.target.value as OcrLangs)} className="w-auto py-1.5">
              {OCR_LANGS.map((l) => <option key={l} value={l}>{t(`ocrLang.${l}`)}</option>)}
            </Select>
          </label>
          {cards.length < BATCH_MAX && <Button variant="secondary" onClick={onCamera}>📷 {t('batch.more')}</Button>}
        </div>
      </div>

      {!ready && (
        <Notice tone="warn" className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <span>{t('batch.notReady')}</span>
          <ButtonLink href="/account" variant="secondary">{t('sell.ready.fix')}</ButtonLink>
        </Notice>
      )}

      <ol className="space-y-4">
        {cards.map((c, i) => <CardRow key={c.key} card={c} index={i + 1} currency={currency} maxPrice={maxPrice} canList={ready} disabled={saving} />)}
      </ol>

      <div className="fixed inset-x-0 bottom-[60px] z-30 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur sm:bottom-0">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            {progress && saving ? <b>{t('batch.saving', { done: progress.done, total: progress.total })}</b>
              : saved === cards.length ? <b className="text-ok">{t('batch.allSaved', { n: saved })}</b>
              : <span>{t('batch.summary', { n: pending.length })} · <b>{money(total, currency)}</b>{failed ? <span className="text-danger"> · {t('batch.failed', { n: failed })}</span> : null}</span>}
          </div>
          {saved === cards.length ? (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => { batch.clearSaved(); onCamera(); }}>📷 {t('batch.newBatch')}</Button>
              <ButtonLink href="/sell">{t('batch.toMyCards')}</ButtonLink>
            </div>
          ) : (
            <Button busy={saving} onClick={saveAll}>{failed ? t('batch.retry') : t('batch.saveAll', { n: pending.length })}</Button>
          )}
        </div>
      </div>
    </div>
  );
}

function CardRow({ card: c, index, currency, maxPrice, canList, disabled }: { card: BatchCard; index: number; currency: string; maxPrice: number; canList: boolean; disabled: boolean }) {
  const { t } = useT();
  const config = useConfig();
  const [target, setTarget] = useState<Target>('name');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const textBox = useRef<HTMLTextAreaElement>(null);
  const done = isDone(c);
  const locked = disabled || done; // a saved card is edited from My cards
  const set = (patch: Partial<BatchCard>) => batch.update(c.key, patch);
  const sides = (['FRONT', 'BACK'] as const).filter((s) => c.photos[s]);
  const reading = sides.some((s) => !c.ocr[s] || c.ocr[s]!.status === 'reading');
  const text = sides.map((s) => c.ocr[s]?.text ?? '').filter(Boolean).join('\n');
  const lines = [...new Set(sides.flatMap((s) => c.ocr[s]?.lines ?? []))];
  const numbers = [...new Set(sides.flatMap((s) => c.ocr[s]?.numbers ?? []))];

  // Name suggestions from Card Pool's catalogue and shared dictionary, once the text is in.
  useEffect(() => {
    if (!text) return;
    let live = true;
    api<{ suggestions: Suggestion[] }>('real-cards/suggest', { body: { text: text.slice(0, 4000) } })
      .then((r) => { if (live) setSuggestions(r.suggestions.filter((s) => s.source !== 'PHOTO').slice(0, 4)); })
      .catch(() => undefined);
    return () => { live = false; };
  }, [text]);

  function fill(value: string) {
    if (locked) return;
    const v = target === 'serial' ? cleanSerial(value) : value.trim().slice(0, MAX_LEN[target]);
    if (!v) return;
    set({ [target]: v, ...(target === 'name' ? { cardId: null } : {}) });
    // Move on to the next empty field, so name → number → set is three taps (the serial only when chosen).
    const next = TARGETS.find((k) => k !== target && k !== 'serial' && !c[k]);
    if (next) setTarget(next);
  }

  function applySelection() {
    const el = textBox.current;
    if (!el) return;
    const picked = el.value.slice(el.selectionStart, el.selectionEnd);
    if (picked.trim()) fill(picked.replace(/\s+/g, ' '));
  }

  function pick(s: Suggestion) {
    if (locked) return;
    set({ name: s.name, cardId: s.cardId, ...(s.setName && !c.setName ? { setName: s.setName } : {}), ...(s.number && !c.number ? { number: s.number } : {}), ...(s.categoryId && !c.categoryId ? { categoryId: s.categoryId } : {}) });
  }

  return (
    <li>
      <Panel className={done ? 'opacity-80' : ''}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold">#{index} {c.name || <span className="font-normal text-muted">{t('batch.unnamed')}</span>}</h2>
          <div className="flex items-center gap-2">
            {done ? <Badge tone="ok">✓ {t('batch.savedOne')}</Badge> : c.savedId ? <Badge tone="warn">{t('batch.partly')}</Badge> : null}
            {!c.savedId && <button type="button" disabled={disabled} onClick={() => batch.remove(c.key)} className="text-sm text-danger">{t('batch.delete')}</button>}
          </div>
        </div>
        {c.error && <Notice tone="danger" className="mt-2">{c.error}</Notice>}

        <div className="mt-3 grid gap-4 md:grid-cols-[13rem_1fr]">
          <div className="flex gap-2 md:flex-col">
            {(['FRONT', 'BACK'] as const).map((s) => (
              <figure key={s} className="w-24 md:w-full">
                <div className="aspect-[63/88] overflow-hidden rounded-xl bg-surface-2">
                  {c.photos[s] ? <img src={c.photos[s]!.url} alt={t(`side.${s}`)} className="size-full object-cover" /> : <span className="grid size-full place-items-center text-xs text-muted">{t('batch.noBack')}</span>}
                </div>
                <figcaption className="mt-1 text-center text-xs text-muted">{t(`side.${s}`)}</figcaption>
              </figure>
            ))}
          </div>

          <div className="min-w-0 space-y-4">
            {/* 1. pick text */}
            <section>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">{t('batch.fillInto')}</span>
                {TARGETS.map((k) => (
                  <button key={k} type="button" disabled={locked} onClick={() => setTarget(k)} aria-pressed={target === k}
                    className={`rounded-full px-3 py-1 text-sm ${target === k ? 'bg-brand text-brand-ink' : 'bg-surface-2'}`}>{t(LABEL[k])}</button>
                ))}
              </div>
              {reading ? (
                <p className="mt-2 text-sm text-muted">⏳ {t('batch.reading')}</p>
              ) : !text ? (
                <p className="mt-2 text-sm text-muted">{t('batch.noText')}</p>
              ) : (
                <>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {/* A number chip fills the card number, or the serial number when that is the chosen field. */}
                    {numbers.map((n) => <Chip key={`n:${n}`} strong disabled={locked} onClick={() => (target === 'serial' ? set({ serial: cleanSerial(n) }) : (setTarget('number'), set({ number: n })))}>#{n}</Chip>)}
                    {lines.map((l) => <Chip key={`l:${l}`} disabled={locked} onClick={() => fill(l)}>{l}</Chip>)}
                  </div>
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm text-muted">{t('batch.selectText')}</summary>
                    <textarea ref={textBox} readOnly value={text} rows={5} className="mt-2 w-full rounded-xl border border-line bg-surface-2 p-2 font-mono text-sm" />
                    <Button variant="secondary" disabled={locked} onClick={applySelection} className="mt-1">{t('batch.useSelection', { field: t(LABEL[target]) })}</Button>
                  </details>
                </>
              )}
              {suggestions.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-muted">{t('form.suggest')}</span>
                  {suggestions.map((s) => <Chip key={`${s.source}:${s.cardId ?? ''}:${s.name}:${s.number}`} disabled={locked} onClick={() => pick(s)}>{s.name}{s.number ? ` · ${s.number}` : ''}</Chip>)}
                </div>
              )}
            </section>

            {/* 2. details + price */}
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
              <Field className="col-span-2 xl:col-span-1" label={t('form.name')}><Input value={c.name} maxLength={80} disabled={locked} onChange={(e) => set({ name: e.target.value, cardId: null })} placeholder={t('form.name.ph')} /></Field>
              <Field label={t('field.number')}><Input value={c.number} maxLength={24} disabled={locked} onChange={(e) => set({ number: e.target.value })} placeholder={t('form.number.ph')} /></Field>
              <Field label={t('field.set')}><Input value={c.setName} maxLength={60} disabled={locked} onChange={(e) => set({ setName: e.target.value })} placeholder={t('form.set.ph')} /></Field>
              <Field label={t('field.language')} hint={c.langAuto && c.ocr.FRONT?.status === 'done' ? t('batch.langDetected') : undefined}>
                <Select value={c.language} disabled={locked} onChange={(e) => set({ language: e.target.value as CardLanguage, langAuto: false })}>
                  {CARD_LANGUAGES.map((x) => <option key={x} value={x}>{t(`clang.${x}`)}</option>)}
                </Select>
              </Field>
              <Field label={t('field.category')}>
                <Select value={c.categoryId} disabled={locked} onChange={(e) => set({ categoryId: e.target.value })}>
                  <option value="">{t('form.category.none')}</option>
                  {(config?.categories ?? []).filter((x) => x.active).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </Select>
              </Field>
              <Field label={t('field.condition')}>
                <Select value={c.condition} disabled={locked} onChange={(e) => set({ condition: e.target.value as Condition })}>
                  {CONDITIONS.map((x) => <option key={x} value={x}>{t(`cond.${x}`)}</option>)}
                </Select>
              </Field>
              <Field label={t('field.grade')}><Input value={c.grade} maxLength={20} disabled={locked} onChange={(e) => set({ grade: e.target.value })} placeholder={t('form.grade.ph')} /></Field>
              <Field label={t('tags.serial')} hint={serialProblem(cleanSerial(c.serial)) ? <span className="text-danger">{t('tags.serial.range')}</span> : undefined}>
                <Input value={c.serial} maxLength={MAX_SERIAL} disabled={locked} onChange={(e) => set({ serial: e.target.value })} onBlur={() => set({ serial: cleanSerial(c.serial) })} placeholder={t('tags.serial.ph')} />
              </Field>
              <Field label={t('form.asking', { cur: currency })}>
                <Input type="number" inputMode="decimal" min={0} max={maxPrice} step="0.01" value={c.asking} disabled={locked} onChange={(e) => set({ asking: e.target.value })} />
              </Field>
              <Field label={t('form.cost')}>
                <Input type="number" inputMode="decimal" min={0} max={maxPrice} step="0.01" value={c.cost} disabled={locked} onChange={(e) => set({ cost: e.target.value })} />
              </Field>
              <Field label={t('form.quantity')}>
                <Input type="number" inputMode="numeric" min={1} max={999} value={c.quantity} disabled={locked} onChange={(e) => set({ quantity: e.target.value })} onBlur={() => set({ quantity: String(clampInt(c.quantity, 1, 999)) })} />
              </Field>
              <Field label={t('form.listed')}>
                <Input type="number" inputMode="numeric" min={0} max={clampInt(c.quantity, 1, 999)} value={c.listed} disabled={locked} onChange={(e) => set({ listed: e.target.value })} onBlur={() => set({ listed: String(clampInt(c.listed, 0, clampInt(c.quantity, 1, 999))) })} />
              </Field>
            </div>
            <TagPicker tags={c.tags} onChange={(tags) => set({ tags })} disabled={locked} />
            {(c.tags.length > 0 || c.serial.trim() !== '') && <p className="text-xs text-muted">{t('tags.private')}</p>}
            <label className={`flex items-center gap-2 text-sm ${!canList ? 'opacity-50' : ''}`}>
              <input type="checkbox" className="size-4 accent-[var(--brand)]" checked={c.isPublic} disabled={!canList || locked} onChange={(e) => set({ isPublic: e.target.checked })} />
              {t('form.public')}
            </label>
            {done && c.savedId && <Link href={`/sell/${encodeURIComponent(c.savedId)}`} className="text-sm font-medium text-brand">{t('listing.edit')} →</Link>}
          </div>
        </div>
      </Panel>
    </li>
  );
}

const Chip = ({ children, onClick, strong, disabled }: { children: ReactNode; onClick: () => void; strong?: boolean; disabled?: boolean }) => (
  <button type="button" onClick={onClick} disabled={disabled}
    className={`max-w-full truncate rounded-full border px-2.5 py-1 text-sm hover:border-brand disabled:opacity-50 ${strong ? 'border-brand/40 bg-brand/10 font-semibold' : 'border-line bg-surface-2'}`}>
    {children}
  </button>
);
