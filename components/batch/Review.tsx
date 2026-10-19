'use client';
// Batch review (spec §4.4): for every scanned card, check the fields the scan filled in — tap a recognised line to
// put it into the chosen field, or select part of the full text — add tags and dates, then save all. Saving is
// sequential with progress and retry; a card that already has a contact is never created twice.
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useSWRConfig } from 'swr';
import { ContactForm, MAX, TEXT_LABEL, formReady, toBody, type TextKey } from '@/components/ContactForm';
import { Badge, Button, Notice, Select } from '@/components/ui';
import { api } from '@/lib/api';
import { BATCH_MAX, batch, isDone, ocrSettings, ocrText, useBatch, type BatchCard } from '@/lib/batch';
import { fixEmailText } from '@/lib/bizcard';
import { useDebounced, useMe } from '@/lib/hooks';
import { useT } from '@/lib/i18n';
import { OCR_LANGS, type OcrLangs } from '@/lib/ocr';
import { toE164 } from '@/lib/phone';
import { displayCompany, fullName, type Contact, type ContactFields, type PhotoSide } from '@/lib/types';

type Target = TextKey | 'phone' | 'email';
const TARGETS: Target[] = ['nameZh', 'nameEn', 'title', 'titleEn', 'company', 'companyEn', 'phone', 'email', 'website', 'address', 'department'];
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

export function BatchReview({ onCamera }: { onCamera: () => void }) {
  const { t, errorText } = useT();
  const cards = useBatch();
  const { mutate } = useSWRConfig();
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [langs, setLangsState] = useState<OcrLangs>(ocrSettings.langs);
  const pending = cards.filter((c) => !isDone(c));

  async function saveOne(c: BatchCard) {
    const fresh = () => batch.get().find((x) => x.key === c.key)!;
    batch.update(c.key, { error: null });
    try {
      if (c.skip) {
        if (!Object.keys(c.photos).length && !formReady(c.fields)) throw new Error(t('review.needsSomething'));
      } else if (!formReady(c.fields)) throw new Error(t('review.needsSomething'));
      let id = c.savedId;
      const merging = c.dup?.choice === 'merge' && c.dup.mergeId;
      let existingSides: PhotoSide[] = [];
      if (!id && merging) {
        const old = await api<Contact>(`contacts/${encodeURIComponent(c.dup!.mergeId!)}`);
        existingSides = old.photos;
        await api(`contacts/${encodeURIComponent(old.id)}`, { method: 'PATCH', body: mergeInto(old, c.fields, ocrText(c)) });
        id = old.id;
        batch.update(c.key, (x) => ({ savedId: id, uploaded: { ...x.uploaded, ...Object.fromEntries(existingSides.map((s) => [s, true])) } }));
      } else if (!id) {
        // Skipped cards keep only valid numbers, so a half-read phone never blocks saving the photo.
        const fields = c.skip ? { ...toBody(c.fields), tagIds: c.fields.tagIds } : toBody(c.fields);
        id = (await api<Contact>('contacts', { body: { ...fields, ocrText: ocrText(c), source: 'SCAN' } })).id;
        batch.update(c.key, { savedId: id });
      } else if (!merging) {
        // A retry after a partial save: this flow created the contact moments ago, so send the fields as they stand.
        await api(`contacts/${encodeURIComponent(id)}`, { method: 'PATCH', body: toBody(c.fields) });
      }
      for (const side of ['FRONT', 'BACK'] as PhotoSide[]) {
        const shot = fresh().photos[side];
        if (shot && !fresh().uploaded[side]) {
          await api(`contacts/${encodeURIComponent(id!)}/photos/${side.toLowerCase()}`, { method: 'PUT', body: shot.blob });
          batch.update(c.key, (x) => ({ uploaded: { ...x.uploaded, [side]: true } }));
        }
      }
    } catch (e) {
      batch.update(c.key, { error: errorText(e) });
    }
  }

  /** 全部略過: save every remaining card with whatever was read, photos included; details can be filled in later. */
  async function skipAll() {
    for (const c of batch.get()) if (!isDone(c)) batch.update(c.key, { skip: true });
    await saveAll();
  }

  async function saveAll() {
    const todo = batch.get().filter((c) => !isDone(c));
    setSaving(true);
    setProgress({ done: 0, total: todo.length });
    for (const [i, c] of todo.entries()) {
      await saveOne(c);
      setProgress({ done: i + 1, total: todo.length });
    }
    await Promise.all([mutate((k) => typeof k === 'string' && k.startsWith('contacts')), mutate('me'), mutate('tags')]);
    setSaving(false);
  }

  const saved = cards.filter(isDone).length;
  const failed = cards.filter((c) => c.error).length;
  const reading = cards.some((c) => Object.values(c.ocr).some((o) => o?.status === 'reading'));

  if (!cards.length) {
    return (
      <div className="rounded-2xl border border-dashed border-line px-6 py-14 text-center">
        <p className="text-muted">{t('review.empty')}</p>
        <Button className="mt-4" onClick={onCamera}>📷 {t('scan.open')}</Button>
      </div>
    );
  }

  return (
    <div className="pb-32">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t('review.title')}</h1>
          <p className="mt-1 text-sm text-muted">{t('review.sub', { n: cards.length, max: BATCH_MAX })}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <span className="whitespace-nowrap">{t('review.ocrLang')}</span>
            <Select value={langs} onChange={(e) => { const l = e.target.value as OcrLangs; ocrSettings.setLangs(l); setLangsState(l); }} className="w-auto py-1.5">
              {OCR_LANGS.map((l) => <option key={l} value={l}>{t(`ocrLang.${l}`)}</option>)}
            </Select>
          </label>
          {cards.length < BATCH_MAX && <Button variant="secondary" onClick={onCamera}>📷 {t('review.more')}</Button>}
        </div>
      </div>

      <ol className="space-y-4">
        {cards.map((c, i) => <CardRow key={c.key} card={c} index={i + 1} disabled={saving} />)}
      </ol>

      <div className="fixed inset-x-0 bottom-[60px] z-30 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur sm:bottom-0">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            {progress && saving ? <b>{t('review.saving', { done: progress.done, total: progress.total })}</b>
              : saved === cards.length ? <b className="text-ok">{t('review.allSaved', { n: saved })}</b>
              : <span>{t('review.summary', { n: pending.length })}{reading ? ` · ${t('review.reading')}` : ''}{failed ? <span className="text-danger"> · {t('review.failed', { n: failed })}</span> : null}</span>}
          </div>
          {saved === cards.length ? (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => { batch.clearSaved(); onCamera(); }}>📷 {t('review.scanMore')}</Button>
              <Link href="/contacts" onClick={() => batch.clearSaved()} className="inline-flex items-center rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-brand-ink">{t('review.toContacts')}</Link>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={skipAll} disabled={saving}>{t('review.skipAll')}</Button>
              <Button onClick={saveAll} busy={saving}>{failed ? t('review.retry') : t('review.saveAll', { n: pending.length })}</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Fill the existing contact's empty fields from the scan; add new phones, e-mails and tags; never overwrite. */
function mergeInto(old: Contact, f: ContactFields, ocr: string) {
  const body: Record<string, unknown> = {};
  for (const k of ['nameZh', 'nameEn', 'title', 'titleEn', 'company', 'companyEn', 'department', 'address', 'website', 'metAt', 'metOn', 'followUpOn'] as const) {
    if (!old[k] && f[k]) body[k] = f[k];
  }
  const add = toBody(f);
  body.phones = [...old.phones, ...add.phones.filter((p) => !old.phones.some((q) => q.e164 === p.e164)).map((p) => ({ ...p, isPrimary: false }))].slice(0, 10);
  body.emails = [...old.emails, ...add.emails.filter((e) => !old.emails.some((q) => q.email === e.email)).map((e) => ({ ...e, isPrimary: false }))].slice(0, 10);
  body.tagIds = [...new Set([...old.tagIds, ...f.tagIds])];
  if (f.notes && !old.notes.includes(f.notes)) body.notes = [old.notes, f.notes].filter(Boolean).join('\n').slice(0, 2000);
  if (ocr && !old.ocrText) body.ocrText = ocr;
  return body;
}

function CardRow({ card: c, index, disabled }: { card: BatchCard; index: number; disabled: boolean }) {
  const { t } = useT();
  const { me } = useMe();
  const [target, setTarget] = useState<Target>('nameZh');
  const [open, setOpen] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const done = isDone(c);
  const f = c.fields;
  const country = me?.user.defaultCountry ?? '852';
  useEffect(() => { ocrSettings.setCountry(country); }, [country]);

  const lines = [...new Set((['FRONT', 'BACK'] as const).flatMap((s) => (c.ocr[s]?.layout ?? []).map((l) => l.text.trim())).filter((l) => l.length >= 2))].slice(0, 30);
  const full = (['FRONT', 'BACK'] as const).map((s) => c.ocr[s]?.text).filter(Boolean).join('\n\n');
  const status = (['FRONT', 'BACK'] as const).map((s) => c.ocr[s]?.status).filter(Boolean);

  // Possible duplicate (spec §4.4 step 6): same phone or e-mail as an existing contact.
  const dupKey = useDebounced([...f.phones.map((p) => p.e164).filter(Boolean), ...f.emails.map((e) => e.email.toLowerCase()).filter(Boolean)].sort().join('|'), 600);
  useEffect(() => {
    if (!dupKey || c.savedId || c.dup?.key === dupKey) return;
    const [phones, emails] = [f.phones.map((p) => p.e164).filter(Boolean), f.emails.map((e) => e.email).filter(Boolean)];
    api<{ contacts: Contact[] }>('contacts/match', { body: { phones, emails } })
      .then((r) => batch.update(c.key, (x) => ({ dup: { key: dupKey, matches: r.contacts, choice: x.dup?.choice && r.contacts.some((m) => m.id === x.dup?.mergeId) ? x.dup.choice : null, mergeId: x.dup?.mergeId ?? null } })))
      .catch(() => undefined);
  }, [dupKey]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Put a piece of text into the chosen field, then move on to the next empty one. */
  function put(raw: string) {
    const v = raw.trim();
    if (!v) return;
    if (target === 'phone') {
      const e164 = toE164(v, country);
      if (e164 && !f.phones.some((p) => p.e164 === e164)) batch.setFields(c.key, { phones: [...f.phones, { kind: 'MOBILE', e164, raw: v, whatsapp: true, isPrimary: !f.phones.length }] });
    } else if (target === 'email') {
      const m = EMAIL_RE.exec(fixEmailText(v).replace(/\s/g, ''));
      if (m && !f.emails.some((e) => e.email === m[0].toLowerCase())) batch.setFields(c.key, { emails: [...f.emails, { email: m[0].toLowerCase(), isPrimary: !f.emails.length }] });
    } else {
      batch.setFields(c.key, { [target]: v.slice(0, MAX[target]) });
    }
    const after = TARGETS.slice(TARGETS.indexOf(target) + 1).find((x) => x !== 'phone' && x !== 'email' && !f[x as TextKey]);
    if (after) setTarget(after);
  }

  function fromSelection() {
    const el = textRef.current;
    if (!el) return;
    put(el.value.slice(el.selectionStart, el.selectionEnd));
  }

  const label = (x: Target) => (x === 'phone' ? t('f.phone') : x === 'email' ? t('f.email') : t(TEXT_LABEL[x]));
  const dup = c.dup?.matches.length ? c.dup : null;

  return (
    <li className={`rounded-2xl border bg-surface p-4 ${c.error ? 'border-danger' : done ? 'border-ok' : 'border-line'}`}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <b className="text-lg">#{index}</b>
        {done ? <Badge tone="ok">✓ {t('review.saved')}</Badge> : c.savedId ? <Badge tone="warn">{t('review.partly')}</Badge> : null}
        {status.includes('reading') && <Badge>{t('review.reading')}</Badge>}
        {status.includes('failed') && <Badge tone="danger">{t('review.ocrFailed')}</Badge>}
        <span className="ml-auto flex gap-2">
          {!done && !c.savedId && (
            <button type="button" onClick={() => batch.update(c.key, { skip: !c.skip, error: null })} disabled={disabled} aria-pressed={c.skip}
              className={`rounded-full px-3 py-1 text-sm font-semibold ${c.skip ? 'bg-brand text-brand-ink' : 'bg-surface-2 text-muted'}`}>
              {c.skip ? `✓ ${t('review.skipped')}` : t('review.skip')}
            </button>
          )}
          {!done && <button type="button" onClick={() => batch.rescan(c.key)} disabled={disabled} className="text-sm text-muted underline">{t('review.rescan')}</button>}
          {!c.savedId && <button type="button" onClick={() => batch.remove(c.key)} disabled={disabled} className="text-sm text-danger underline">{t('common.remove')}</button>}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {(['FRONT', 'BACK'] as const).map((s) => (
              <a key={s} href={c.photos[s]?.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-line bg-surface-2">
                {c.photos[s] ? <img src={c.photos[s]!.url} alt={t(`side.${s}`)} className="aspect-[90/54] w-full object-cover" />
                  : <span className="grid aspect-[90/54] place-items-center text-xs text-muted">{t(`side.${s}`)}</span>}
              </a>
            ))}
          </div>

          {!done && !c.skip && (
            <>
              <div>
                <p className="mb-1.5 text-xs font-semibold text-muted">{t('review.fillInto')}</p>
                <div className="flex flex-wrap gap-1.5">
                  {TARGETS.map((x) => (
                    <button key={x} type="button" onClick={() => setTarget(x)} aria-pressed={target === x}
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${target === x ? 'bg-brand text-brand-ink' : 'bg-surface-2 text-muted'}`}>{label(x)}</button>
                  ))}
                </div>
              </div>
              {lines.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-muted">{t('review.tapLine', { field: label(target) })}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {lines.map((l) => (
                      <button key={l} type="button" onClick={() => put(l)} className="max-w-full truncate rounded-lg border border-line bg-bg px-2 py-1 text-left text-sm hover:border-brand">{l}</button>
                    ))}
                  </div>
                </div>
              )}
              {full && (
                <div>
                  <button type="button" onClick={() => setOpen(!open)} className="text-sm font-semibold text-brand">{open ? '▾' : '▸'} {t('review.selectText')}</button>
                  {open && (
                    <div className="mt-2">
                      <textarea ref={textRef} readOnly value={full} className="h-40 w-full rounded-xl border border-line bg-bg p-2 font-mono text-xs" />
                      <Button variant="secondary" className="mt-2" onClick={fromSelection}>{t('review.putSelection', { field: label(target) })}</Button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className={done ? 'pointer-events-none opacity-70' : ''}>
          {dup && !c.savedId && (
            <Notice tone="warn" className="mb-4">
              <p className="font-semibold">{t('review.dup', { who: dup.matches.map((m) => `${fullName(m)}${displayCompany(m) ? `（${displayCompany(m)}）` : ''}`).join('、') })}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {dup.matches.map((m) => (
                  <Button key={m.id} variant={dup.choice === 'merge' && dup.mergeId === m.id ? 'primary' : 'secondary'} className="py-1.5"
                    onClick={() => batch.update(c.key, { dup: { ...dup, choice: 'merge', mergeId: m.id } })}>{t('review.mergeInto', { who: fullName(m) || displayCompany(m) })}</Button>
                ))}
                <Button variant={dup.choice === 'new' ? 'primary' : 'secondary'} className="py-1.5" onClick={() => batch.update(c.key, { dup: { ...dup, choice: 'new', mergeId: null } })}>{t('review.saveNew')}</Button>
              </div>
            </Notice>
          )}
          {c.skip && !done ? (
            <Notice className="mb-3">{t('review.skipNote')} <button type="button" className="font-semibold text-brand underline" onClick={() => batch.update(c.key, { skip: false })}>{t('review.unskip')}</button></Notice>
          ) : (
            <ContactForm value={f} onChange={(p) => batch.setFields(c.key, p)} highlight={target === 'phone' || target === 'email' ? null : target} compact />
          )}
          {c.error && <Notice tone="danger" className="mt-3">{c.error}</Notice>}
        </div>
      </div>
    </li>
  );
}
