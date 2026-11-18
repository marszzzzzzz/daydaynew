'use client';
// Batch scan (spec §10): shoot up to 10 cards front + back in a row, then pick their text, price and save all.
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { BatchCamera } from '@/components/batch/Camera';
import { BatchReview } from '@/components/batch/Review';
import { RequireSignIn } from '@/components/RequireSignIn';
import { Loading } from '@/components/ui';
import { batch, isDone, useBatch, type BatchCard } from '@/lib/batch';
import { sellerReady } from '@/lib/cards';
import { OCR_LANGS, readText, type OcrLangs } from '@/lib/ocr';
import { readPlayerCard } from '@/lib/sports';
import type { Me, PhotoSide } from '@/lib/types';

export default function BatchPage() {
  return <RequireSignIn>{(me) => <Suspense fallback={<Loading />}><Batch me={me} /></Suspense>}</RequireSignIn>;
}

const LANGS_KEY = 'cm_ocr_langs';

function Batch({ me }: { me: Me }) {
  const router = useRouter();
  const cards = useBatch();
  const [step, setStep] = useState<'camera' | 'review'>(useSearchParams().get('step') === 'review' && batch.get().length ? 'review' : 'camera');
  const [langs, setLangsState] = useState<OcrLangs>(() => {
    try { const v = localStorage.getItem(LANGS_KEY) as OcrLangs; if (OCR_LANGS.includes(v)) return v; } catch { /* private mode */ }
    return 'auto';
  });

  function setLangs(l: OcrLangs) {
    setLangsState(l);
    try { localStorage.setItem(LANGS_KEY, l); } catch { /* private mode */ }
    for (const c of batch.get()) if (!isDone(c)) batch.update(c.key, { ocr: {} }); // read again in the new language
  }

  // Background OCR: every photo without a reading is queued (one at a time on a shared worker).
  useEffect(() => {
    for (const c of cards) {
      for (const side of ['FRONT', 'BACK'] as PhotoSide[]) {
        const shot = c.photos[side];
        if (!shot || c.ocr[side]) continue;
        batch.update(c.key, (x) => ({ ocr: { ...x.ocr, [side]: { status: 'reading', text: '', lines: [], numbers: [] } } }));
        readText(shot.blob, langs).then((r) => {
          const cur = batch.get().find((x) => x.key === c.key);
          if (cur?.photos[side] !== shot) return; // retaken meanwhile
          batch.update(c.key, (x) => {
            const ocr = { ...x.ocr, [side]: { status: 'done' as const, text: r.text, lines: r.lines, numbers: r.numbers, layout: r.layout } };
            // Helpful defaults the user can change: the printed card number, the front's language (until the
            // user picks one) and, on a player card, the name, the number from the top of the back and the
            // publisher + year for the notes. A field is filled only while empty or still holding our own guess.
            const pc = readPlayerCard(ocr.FRONT?.layout, ocr.BACK?.layout);
            // A player card's top-of-back number may replace an earlier guess; any other number only fills a blank.
            const guess = { number: pc.number ?? (x.number ? '' : r.numbers[0] ?? ''), name: pc.name ?? '', notes: pc.note ?? '' };
            const fill: Partial<BatchCard> = {};
            const auto = { ...x.auto };
            for (const k of ['number', 'name', 'notes'] as const) {
              if (guess[k] && (!x[k] || x[k] === x.auto[k])) { fill[k] = guess[k]; auto[k] = guess[k]; }
            }
            if (fill.name) fill.cardId = null;
            return {
              ocr, ...fill, auto, sports: pc.sports,
              ...(side === 'FRONT' && r.text && x.langAuto ? { language: r.language } : {}),
            };
          });
        }).catch(() => {
          batch.update(c.key, (x) => ({ ocr: { ...x.ocr, [side]: { status: 'failed', text: '', lines: [], numbers: [] } } }));
        });
      }
    }
  }, [cards, langs]);

  // Photos live in memory until saved: warn before the tab is closed or reloaded.
  const unsaved = cards.some((c) => !isDone(c));
  useEffect(() => {
    if (!unsaved) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsaved]);

  return step === 'camera'
    ? <BatchCamera defaultPublic={sellerReady(me)} onReview={() => setStep('review')} onClose={() => router.push(cards.length ? '/sell/batch?step=review' : '/sell')} />
    : <BatchReview langs={langs} setLangs={setLangs} onCamera={() => setStep('camera')} />;
}
