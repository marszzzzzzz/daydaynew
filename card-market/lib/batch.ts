// Batch capture state (spec §10): up to 10 cards, each a front and an optional back photo, the OCR text of
// both, the fields the user picks, and how far saving got. Kept in a module-level store so it survives moving
// between the camera, the review screen and other pages; photos stay in memory until they are saved.
'use client';
import { useSyncExternalStore } from 'react';
import type { CardLanguage, Condition, PhotoSide } from './types';

export const BATCH_MAX = 10;

export interface Shot { blob: Blob; url: string }
export type OcrState = { status: 'idle' | 'reading' | 'done' | 'failed'; text: string; lines: string[]; numbers: string[] };

export interface BatchCard {
  key: string;
  photos: Partial<Record<PhotoSide, Shot>>;
  ocr: Partial<Record<PhotoSide, OcrState>>;
  name: string; cardId: string | null; categoryId: string; setName: string; number: string;
  language: CardLanguage; langAuto: boolean; condition: Condition; grade: string;
  quantity: string; asking: string; listed: string; isPublic: boolean;
  // Saving: the record id once created, which photos are up, the market switch, and the last error.
  savedId: string | null; uploaded: Partial<Record<PhotoSide, boolean>>; listedDone: boolean; error: string | null;
}

let cards: BatchCard[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
let seq = 0;

export const batch = {
  get: () => cards,
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
  add(defaults: Partial<BatchCard>): BatchCard {
    const c: BatchCard = {
      key: `c${++seq}`, photos: {}, ocr: {}, name: '', cardId: null, categoryId: '', setName: '', number: '',
      language: 'en', langAuto: true, condition: 'NEAR_MINT', grade: '', quantity: '1', asking: '', listed: '1', isPublic: false,
      savedId: null, uploaded: {}, listedDone: false, error: null, ...defaults,
    };
    cards = [...cards, c];
    emit();
    return c;
  },
  update(key: string, patch: Partial<BatchCard> | ((c: BatchCard) => Partial<BatchCard>)) {
    cards = cards.map((c) => (c.key === key ? { ...c, ...(typeof patch === 'function' ? patch(c) : patch) } : c));
    emit();
  },
  setPhoto(key: string, side: PhotoSide, blob: Blob) {
    const c = cards.find((x) => x.key === key);
    if (!c) return;
    const old = c.photos[side];
    if (old) URL.revokeObjectURL(old.url);
    batch.update(key, (x) => ({ photos: { ...x.photos, [side]: { blob, url: URL.createObjectURL(blob) } }, ocr: { ...x.ocr, [side]: undefined }, uploaded: { ...x.uploaded, [side]: false } }));
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

/** Saved completely: record created, every photo uploaded, listing switched if asked. */
export const isDone = (c: BatchCard) =>
  !!c.savedId && (Object.keys(c.photos) as PhotoSide[]).every((s) => c.uploaded[s]) && (!c.isPublic || c.listedDone);

export function useBatch() {
  return useSyncExternalStore(batch.subscribe, batch.get, () => cards);
}
