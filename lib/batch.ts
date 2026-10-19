// Batch scan state (spec §4): up to 10 cards, each a front and an optional back photo, the OCR result of both,
// the contact fields, and how far saving got. A module-level store, so it survives moving between the camera and
// the review screen; photos stay in memory until saved. Text recognition starts as soon as a photo is placed and
// runs one photo at a time in the background (lib/ocr.ts), then the fields are filled from both sides (lib/bizcard.ts).
'use client';
import { useSyncExternalStore } from 'react';
import { parseCard, type ParsedCard, type TextField } from './bizcard';
import { readText, type OcrLangs, type OcrLine } from './ocr';
import { emptyContact, type Contact, type ContactFields, type PhotoSide } from './types';

export const BATCH_MAX = 10;

export interface Shot { blob: Blob; url: string }
export interface OcrState { status: 'reading' | 'done' | 'failed'; text: string; lines: string[]; layout: OcrLine[] }
export interface Dup { key: string; matches: Contact[]; choice: 'new' | 'merge' | null; mergeId: string | null }

export interface BatchCard {
  key: string;
  photos: Partial<Record<PhotoSide, Shot>>;
  ocr: Partial<Record<PhotoSide, OcrState>>;
  fields: ContactFields;
  /** Values the scan filled in itself: a later, better reading may replace them; anything typed stays (spec §4.3). */
  auto: Partial<Record<TextField, string>>;
  parsed: ParsedCard | null;
  dup: Dup | null;
  /** 略過: save the photos now and fill the details in later. */
  skip: boolean;
  savedId: string | null; uploaded: Partial<Record<PhotoSide, boolean>>; error: string | null;
}

let cards: BatchCard[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
let seq = 0;
let langs: OcrLangs = 'auto';
let country = '852';

export const ocrSettings = {
  get langs() { return langs; },
  setLangs(l: OcrLangs) { langs = l; },
  setCountry(c: string) { country = c; },
};

const TEXT_FIELDS: TextField[] = ['nameZh', 'nameEn', 'title', 'titleEn', 'company', 'companyEn', 'department', 'address', 'website'];

function applyParse(key: string) {
  const c = cards.find((x) => x.key === key);
  if (!c) return;
  const sides = (['FRONT', 'BACK'] as PhotoSide[]).map((s) => c.ocr[s]).filter((o): o is OcrState => o?.status === 'done')
    .map((o) => (o.layout.length ? o.layout : o.text.split('\n').map((text) => ({ text, y: 0, h: 0 }))));
  if (!sides.length) return;
  const parsed = parseCard(sides, country);
  batch.update(key, (x) => {
    const fields = { ...x.fields };
    const auto = { ...x.auto };
    for (const f of TEXT_FIELDS) {
      const v = parsed.fields[f]?.value;
      if (v && (!fields[f] || fields[f] === auto[f])) { fields[f] = v; auto[f] = v; }
    }
    for (const p of parsed.phones) {
      if (!fields.phones.some((q) => q.e164 === p.e164)) fields.phones = [...fields.phones, { ...p, isPrimary: !fields.phones.length }];
    }
    for (const e of parsed.emails) {
      if (!fields.emails.some((q) => q.email === e)) fields.emails = [...fields.emails, { email: e, isPrimary: !fields.emails.length }];
    }
    fields.language = parsed.language;
    return { fields, auto, parsed };
  });
}

function startOcr(key: string, side: PhotoSide, blob: Blob) {
  batch.update(key, (x) => ({ ocr: { ...x.ocr, [side]: { status: 'reading', text: '', lines: [], layout: [] } } }));
  readText(blob, langs).then(
    (r) => {
      const c = cards.find((x) => x.key === key);
      if (!c || c.photos[side]?.blob !== blob) return; // retaken meanwhile
      batch.update(key, (x) => ({ ocr: { ...x.ocr, [side]: { status: 'done', text: r.text, lines: r.lines, layout: r.layout } } }));
      applyParse(key);
    },
    () => batch.update(key, (x) => ({ ocr: { ...x.ocr, [side]: { status: 'failed', text: '', lines: [], layout: [] } } })),
  );
}

export const batch = {
  get: () => cards,
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
  add(fields?: Partial<ContactFields>): BatchCard {
    const c: BatchCard = {
      key: `c${++seq}`, photos: {}, ocr: {}, fields: { ...emptyContact(), ...fields }, auto: {}, parsed: null, dup: null,
      skip: false, savedId: null, uploaded: {}, error: null,
    };
    cards = [...cards, c];
    emit();
    return c;
  },
  update(key: string, patch: Partial<BatchCard> | ((c: BatchCard) => Partial<BatchCard>)) {
    cards = cards.map((c) => (c.key === key ? { ...c, ...(typeof patch === 'function' ? patch(c) : patch) } : c));
    emit();
  },
  setFields(key: string, patch: Partial<ContactFields>) {
    batch.update(key, (c) => ({ fields: { ...c.fields, ...patch } }));
  },
  setPhoto(key: string, side: PhotoSide, blob: Blob) {
    const c = cards.find((x) => x.key === key);
    if (!c) return;
    const old = c.photos[side];
    if (old) URL.revokeObjectURL(old.url);
    batch.update(key, (x) => ({ photos: { ...x.photos, [side]: { blob, url: URL.createObjectURL(blob) } }, uploaded: { ...x.uploaded, [side]: false } }));
    startOcr(key, side, blob);
  },
  /** Read every photo again (after changing the OCR language). */
  rescan(key: string) {
    const c = cards.find((x) => x.key === key);
    if (!c) return;
    for (const side of ['FRONT', 'BACK'] as PhotoSide[]) { const s = c.photos[side]; if (s) startOcr(key, side, s.blob); }
  },
  remove(key: string) {
    const c = cards.find((x) => x.key === key);
    Object.values(c?.photos ?? {}).forEach((s) => s && URL.revokeObjectURL(s.url));
    cards = cards.filter((x) => x.key !== key);
    emit();
  },
  /** Drop the cards that are fully saved (their photos are on the server now). */
  clearSaved() {
    cards.filter(isDone).forEach((c) => Object.values(c.photos).forEach((s) => s && URL.revokeObjectURL(s.url)));
    cards = cards.filter((c) => !isDone(c));
    emit();
  },
};

/** Saved completely: contact created and every photo uploaded. */
export const isDone = (c: BatchCard) => !!c.savedId && (Object.keys(c.photos) as PhotoSide[]).every((s) => c.uploaded[s]);
export const ocrText = (c: BatchCard) => (['FRONT', 'BACK'] as const).map((s) => c.ocr[s]?.text ?? '').filter(Boolean).join('\n').slice(0, 4000);

export function useBatch() {
  return useSyncExternalStore(batch.subscribe, batch.get, () => cards);
}
