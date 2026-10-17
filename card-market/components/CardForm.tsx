'use client';
// Add or edit one real-card record: photos, details, selling price and the public-listing switch.
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useSWRConfig } from 'swr';
import { api } from '@/lib/api';
import { CARD_LANGUAGES, CONDITIONS, clampInt, glyph, photoUrl, sellerReady } from '@/lib/cards';
import { useConfig, useDebounced, useMe } from '@/lib/hooks';
import { useT } from '@/lib/i18n';
import { shrinkPhoto } from '@/lib/image';
import type { CardLanguage, Condition, PhotoSide, RealCard, Suggestion } from '@/lib/types';
import { Button, ConfirmDialog, Field, Input, Notice, Panel, Select } from './ui';

interface PhotoState { blob: Blob | null; preview: string | null; existing: number | null; remove: boolean }
const SIDES: PhotoSide[] = ['FRONT', 'BACK'];
const priceOrNull = (s: string) => (s.trim() === '' ? null : Number(s));
type Body = Record<string, unknown>;

/** The record's fields as the edit form would send them, for diffing against what was loaded. */
const bodyOfCard = (c: RealCard): Body => ({
  name: c.name, cardId: c.cardId, categoryId: c.category?.id ?? null, setName: c.setName, number: c.number,
  language: c.language, condition: c.condition, grade: c.grade, quantity: c.quantity, notes: c.notes,
  askingPrice: c.askingPrice, costPrice: c.costPrice, listedQuantity: c.listedQuantity,
});

export function CardForm({ card, stale, onSaved, onDeleted }: { card?: RealCard; stale?: boolean; onSaved?: () => void; onDeleted?: () => void }) {
  const { t, errorText } = useT();
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const config = useConfig();
  const { me } = useMe();
  const currency = card?.currency ?? config?.config.realCards.currency ?? 'HKD';
  const maxPrice = config?.config.realCards.maxPrice ?? 10_000_000;

  const [name, setName] = useState(card?.name ?? '');
  const [cardId, setCardId] = useState<string | null>(card?.cardId ?? null);
  const [categoryId, setCategoryId] = useState(card?.category?.id ?? '');
  const [setNameV, setSetName] = useState(card?.setName ?? '');
  const [number, setNumber] = useState(card?.number ?? '');
  const [language, setLanguage] = useState<CardLanguage>(card?.language ?? 'en');
  const [condition, setCondition] = useState<Condition>(card?.condition ?? 'NEAR_MINT');
  const [grade, setGrade] = useState(card?.grade ?? '');
  const [quantityS, setQuantity] = useState(String(card?.quantity ?? 1));
  const [asking, setAsking] = useState(card?.askingPrice?.toString() ?? '');
  const [listedS, setListed] = useState(String(card?.listedQuantity ?? 1));
  const [cost, setCost] = useState(card?.costPrice?.toString() ?? '');
  const [notes, setNotes] = useState(card?.notes ?? '');
  // New cards go public by default only when the account can sell (else the listing step would fail).
  const [isPublic, setIsPublic] = useState(() => card?.marketPublic ?? sellerReady(me));
  // Set once the record exists, so a retry after a partial save edits it instead of adding a duplicate.
  const [savedId, setSavedId] = useState<string | null>(card?.id ?? null);
  // What the server holds as far as this form knows. An edit sends only the fields that differ, so a form
  // opened before a deal completed elsewhere cannot write back the copies that deal took off the record.
  const baseline = useRef<Body | null>(card ? bodyOfCard(card) : null);
  const publicBaseline = useRef(card?.marketPublic ?? false);
  const quantity = clampInt(quantityS, 1, 999);
  const listed = clampInt(listedS, 0, quantity);
  const [photos, setPhotos] = useState<Record<PhotoSide, PhotoState>>(() => {
    const at = (s: PhotoSide) => card?.photos.find((p) => p.side === s)?.uploadedAt ?? null;
    return { FRONT: { blob: null, preview: null, existing: at('FRONT'), remove: false }, BACK: { blob: null, preview: null, existing: at('BACK'), remove: false } };
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Name suggestions from the Card Pool catalog and the shared name dictionary.
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const picked = useRef(card?.name ?? '');
  const query = useDebounced(name.trim(), 400);
  useEffect(() => {
    if (query.length < 3 || query === picked.current) { setSuggestions([]); return; }
    let live = true;
    api<{ suggestions: Suggestion[] }>('real-cards/suggest', { body: { text: query } })
      .then((r) => { if (live) setSuggestions(r.suggestions.filter((s) => s.source !== 'PHOTO').slice(0, 5)); })
      .catch(() => { if (live) setSuggestions([]); });
    return () => { live = false; };
  }, [query]);

  // Release object URLs for previews.
  const previews = useRef<string[]>([]);
  useEffect(() => () => previews.current.forEach((u) => URL.revokeObjectURL(u)), []);

  function pick(s: Suggestion) {
    picked.current = s.name;
    setName(s.name);
    setCardId(s.cardId);
    if (!setNameV && s.setName) setSetName(s.setName);
    if (!number && s.number) setNumber(s.number);
    if (!categoryId && s.categoryId) setCategoryId(s.categoryId);
    setSuggestions([]);
  }

  async function choosePhoto(side: PhotoSide, file: File | undefined) {
    if (!file) return;
    setErr(null);
    try {
      const blob = await shrinkPhoto(file);
      const preview = URL.createObjectURL(blob);
      previews.current.push(preview);
      setPhotos((p) => ({ ...p, [side]: { ...p[side], blob, preview, remove: false } }));
    } catch {
      setErr(t('err.PHOTO_UNREADABLE'));
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) { setErr(t('form.nameShort')); return; }
    setBusy(true);
    setErr(null);
    const body: Body = {
      name: name.trim(), cardId: name.trim() === picked.current ? cardId : null, categoryId: categoryId || null,
      setName: setNameV, number, language, condition, grade, quantity, notes,
      askingPrice: priceOrNull(asking), costPrice: priceOrNull(cost), listedQuantity: listed,
    };
    let id = savedId;
    try {
      if (!id) {
        id = (await api<RealCard>('real-cards', { body: { ...body, source: 'MANUAL' } })).id;
        setSavedId(id);
        // Reloading now opens the edit page for this record, not a blank form.
        window.history.replaceState(null, '', `/sell/${encodeURIComponent(id)}`);
      } else {
        const was = baseline.current ?? {};
        const changed = Object.fromEntries(Object.entries(body).filter(([k, v]) => was[k] !== v));
        if (Object.keys(changed).length) await api<RealCard>(`real-cards/${encodeURIComponent(id)}`, { method: 'PATCH', body: changed });
      }
      baseline.current = body;
    } catch (e) {
      setErr(errorText(e));
      setBusy(false);
      return;
    }
    const path = `real-cards/${encodeURIComponent(id)}`;
    const problems: string[] = [];
    for (const side of SIDES) {
      const p = photos[side];
      try {
        if (p.blob) {
          const r = await api<{ uploadedAt: number }>(`${path}/photos/${side.toLowerCase()}`, { method: 'PUT', body: p.blob });
          setPhotos((s) => ({ ...s, [side]: { ...s[side], blob: null, existing: r.uploadedAt, remove: false } }));
        } else if (p.remove && p.existing) {
          await api(`${path}/photos/${side.toLowerCase()}`, { method: 'DELETE' });
          setPhotos((s) => ({ ...s, [side]: { ...s[side], existing: null, remove: false } }));
        }
      } catch (e) {
        problems.push(t('form.photoFailed', { msg: errorText(e) }));
      }
    }
    // Only when the seller flipped the switch (a deal may have taken the card off the market meanwhile).
    if (isPublic !== publicBaseline.current) {
      try {
        await api(`${path}/market`, { body: { public: isPublic } });
        publicBaseline.current = isPublic;
      } catch (e) {
        problems.push(t('form.listFailed', { msg: errorText(e) }));
      }
    }
    await refresh();
    onSaved?.(); // the edit page re-baselines on the copy the server now holds
    if (problems.length) {
      setErr(problems.join('\n'));
      setBusy(false);
      return;
    }
    router.push('/sell');
  }

  const refresh = () => Promise.all([mutate('real-cards'), mutate('me'), mutate((k) => typeof k === 'string' && k.startsWith('real-market'))]);

  async function remove() {
    if (!card) return;
    setBusy(true);
    try {
      await api(`real-cards/${encodeURIComponent(card.id)}`, { method: 'DELETE' });
      onDeleted?.(); // the edit page shows a spinner, not "card not found", while we leave
      router.push('/sell');
      await refresh();
    } catch (e) {
      setErr(errorText(e));
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  const categories = config?.categories.filter((c) => c.active || c.id === categoryId) ?? [];
  const category = categories.find((c) => c.id === categoryId) ?? null;

  return (
    <form onSubmit={submit} className="grid gap-5 lg:grid-cols-[20rem_1fr]">
      <Panel className="space-y-4 self-start">
        <h2 className="font-bold">{t('form.photos')}</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
          {SIDES.map((side) => {
            const p = photos[side];
            const src = p.preview ?? (p.existing && !p.remove && savedId ? photoUrl(savedId, side, p.existing) : null);
            return (
              <div key={side}>
                <p className="mb-1.5 text-sm font-medium">{t(`form.photo.${side}`)}</p>
                <label className="relative block aspect-[63/88] cursor-pointer overflow-hidden rounded-xl border-2 border-dashed border-line bg-surface-2 hover:border-brand lg:mx-auto lg:w-48">
                  {src ? (
                    // Plain <img>: a local preview or a private photo from the proxy.
                    <img src={src} alt={t(`side.${side}`)} className="size-full object-cover" />
                  ) : (
                    <span className="grid size-full place-items-center p-3 text-center text-sm text-muted">
                      <span><span className="block text-3xl" aria-hidden>{side === 'FRONT' ? glyph(category?.glyph) : '📷'}</span>{t('form.photo.add')}</span>
                    </span>
                  )}
                  <input type="file" accept="image/jpeg,image/png,image/webp,image/*" className="sr-only" aria-label={t(`form.photo.${side}`)}
                    onChange={(e) => { choosePhoto(side, e.target.files?.[0]); e.target.value = ''; }} />
                </label>
                {src && (
                  <button type="button" className="mt-1.5 text-xs text-danger"
                    onClick={() => setPhotos((s) => ({ ...s, [side]: { ...s[side], blob: null, preview: null, remove: true } }))}>
                    {t('form.photo.remove')}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted">{t('form.photo.hint')}</p>
      </Panel>

      <div className="space-y-5">
        <Panel className="space-y-4">
          <h2 className="font-bold">{t('form.details')}</h2>
          <div>
            <Field label={t('form.name')}>
              <Input required minLength={2} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('form.name.ph')} autoComplete="off" />
            </Field>
            {suggestions.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted">{t('form.suggest')}</span>
                {suggestions.map((s) => (
                  <button key={`${s.source}:${s.cardId ?? ''}:${s.name}:${s.number}`} type="button" onClick={() => pick(s)}
                    className="rounded-full border border-line bg-surface-2 px-2.5 py-1 text-xs hover:border-brand">
                    {s.name}{s.number ? ` · ${s.number}` : ''}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Grid>
            <Field label={t('field.category')}>
              <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">{t('form.category.none')}</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label={t('field.set')}><Input maxLength={60} value={setNameV} onChange={(e) => setSetName(e.target.value)} placeholder={t('form.set.ph')} /></Field>
            <Field label={t('field.number')}><Input maxLength={24} value={number} onChange={(e) => setNumber(e.target.value)} placeholder={t('form.number.ph')} /></Field>
            <Field label={t('field.language')}>
              <Select value={language} onChange={(e) => setLanguage(e.target.value as CardLanguage)}>
                {CARD_LANGUAGES.map((l) => <option key={l} value={l}>{t(`clang.${l}`)}</option>)}
              </Select>
            </Field>
            <Field label={t('field.condition')}>
              <Select value={condition} onChange={(e) => setCondition(e.target.value as Condition)}>
                {CONDITIONS.map((c) => <option key={c} value={c}>{t(`cond.${c}`)}</option>)}
              </Select>
            </Field>
            <Field label={t('field.grade')}><Input maxLength={20} value={grade} onChange={(e) => setGrade(e.target.value)} placeholder={t('form.grade.ph')} /></Field>
            <Field label={t('form.quantity')}>
              <Input type="number" inputMode="numeric" min={1} max={999} step={1} required value={quantityS}
                onChange={(e) => setQuantity(e.target.value)} onBlur={() => setQuantity(String(quantity))} />
            </Field>
          </Grid>
        </Panel>

        <Panel className="space-y-4">
          <h2 className="font-bold">{t('form.selling')}</h2>
          <Grid>
            <Field label={t('form.asking', { cur: currency })}>
              <Input type="number" inputMode="decimal" min={0} max={maxPrice} step="0.01" value={asking} onChange={(e) => setAsking(e.target.value)} />
            </Field>
            <Field label={t('form.listed')}>
              <Input type="number" inputMode="numeric" min={0} max={quantity} step={1} value={listedS}
                onChange={(e) => setListed(e.target.value)} onBlur={() => setListed(String(listed))} />
            </Field>
            <Field label={t('form.cost')}>
              <Input type="number" inputMode="decimal" min={0} max={maxPrice} step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} />
            </Field>
          </Grid>
          <Field label={t('form.notes')}><Input maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          <label className={`flex items-start gap-3 rounded-xl border border-line p-3 ${card?.marketRemovedByAdmin ? 'opacity-60' : ''}`}>
            <input type="checkbox" role="switch" className="mt-0.5 size-5 accent-[var(--brand)]" checked={isPublic}
              disabled={card?.marketRemovedByAdmin} onChange={(e) => setIsPublic(e.target.checked)} />
            <span>
              <span className="block font-semibold">{t('form.public')}</span>
              <span className="block text-xs text-muted">{card?.marketRemovedByAdmin ? t('err.REMOVED_BY_ADMIN') : t('form.public.hint')}</span>
            </span>
          </label>
        </Panel>

        {err && <Notice tone="danger" className="whitespace-pre-line">{err}</Notice>}

        <div className="flex flex-wrap items-center justify-between gap-3">
          {card ? <Button type="button" variant="danger" onClick={() => setConfirmDelete(true)} disabled={busy}>{t('form.delete')}</Button> : <span />}
          <Button type="submit" busy={busy} disabled={stale} className="min-w-32">{busy ? t('form.saving') : t('form.save')}</Button>
        </div>
      </div>

      <ConfirmDialog open={confirmDelete} danger busy={busy} message={t('form.delete.confirm')} confirmLabel={t('form.delete')}
        onConfirm={remove} onClose={() => setConfirmDelete(false)} />
    </form>
  );
}

const Grid = ({ children }: { children: ReactNode }) => <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{children}</div>;
