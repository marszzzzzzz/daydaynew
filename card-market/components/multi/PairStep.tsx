'use client';
// Pair the backs with the fronts. Cards turned over where they lie are in the same order in both photos,
// so card n's back starts as back n; the person can change any pair (a back used twice is swapped, so
// every back belongs to at most one front), reverse the order if the row was turned over as a whole,
// or leave a card without a back.
import { useEffect, useState } from 'react';
import { Button, Select } from '@/components/ui';
import { cropCard, type Shot } from '@/lib/detect';
import { useT } from '@/lib/i18n';

const NONE = -1;

function useCrops(shot: Shot) {
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    let live = true;
    const made: string[] = [];
    Promise.all(shot.boxes.map((b) => cropCard(shot.img, b))).then((blobs) => {
      for (const b of blobs) made.push(URL.createObjectURL(b));
      if (live) setUrls(made); else made.forEach((u) => URL.revokeObjectURL(u));
    }).catch(() => undefined);
    return () => { live = false; made.forEach((u) => URL.revokeObjectURL(u)); };
  }, [shot]);
  return urls;
}

export function PairStep({ front, back, onBack, onConfirm }: { front: Shot; back: Shot; onBack: () => void; onConfirm: (pairs: number[]) => void }) {
  const { t } = useT();
  const fronts = useCrops(front), backs = useCrops(back);
  const nF = front.boxes.length, nB = back.boxes.length;
  const [pairs, setPairs] = useState<number[]>(() => Array.from({ length: nF }, (_, i) => (i < nB ? i : NONE)));

  function choose(i: number, b: number) {
    setPairs((p) => {
      const next = [...p];
      const other = b === NONE ? -1 : next.indexOf(b);
      if (other >= 0 && other !== i) next[other] = next[i]; // swap: the other front takes this one's back
      next[i] = b;
      return next;
    });
  }
  // Reverse the current pairing (pressing it again undoes it).
  const reverse = () => setPairs((p) => p.map((_, i) => p[nF - 1 - i]));

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-surface p-4 text-center">
        <p className="text-xl font-bold">{t('multi.pairQ')}</p>
        <p className="mt-1 text-sm text-muted">{t('multi.pairHint')}</p>
        {nF !== nB && <p className="mt-1 text-sm text-warn">{t('multi.backMismatch', { front: nF, n: nB })}</p>}
      </div>
      <ol className="space-y-3">
        {Array.from({ length: nF }, (_, i) => (
          <li key={i} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
            <span className="w-6 shrink-0 text-center text-lg font-extrabold">{i + 1}</span>
            <Thumb src={fronts[i]} label={t('side.FRONT')} />
            <span aria-hidden className="text-muted">⇄</span>
            <Thumb src={pairs[i] === NONE ? undefined : backs[pairs[i]]} label={t('side.BACK')} empty={pairs[i] === NONE} />
            <label className="ml-auto min-w-0 text-sm">
              <span className="mb-1 block text-xs text-muted">{t('multi.pairWhich', { n: i + 1 })}</span>
              <Select value={pairs[i]} onChange={(e) => choose(i, Number(e.target.value))} className="py-1.5">
                {Array.from({ length: nB }, (_, b) => <option key={b} value={b}>{t('multi.backN', { n: b + 1 })}</option>)}
                <option value={NONE}>{t('batch.noBack')}</option>
              </Select>
            </label>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap justify-between gap-2">
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onBack}>← {t('multi.retakeBack')}</Button>
          <Button variant="secondary" onClick={reverse}>⇆ {t('multi.reverse')}</Button>
        </div>
        <Button onClick={() => onConfirm(pairs)}>{t('multi.pairOk')}</Button>
      </div>
    </div>
  );
}

function Thumb({ src, label, empty }: { src?: string; label: string; empty?: boolean }) {
  return (
    <figure className="w-16 shrink-0 sm:w-20">
      <div className="aspect-[63/88] overflow-hidden rounded-lg bg-surface-2">
        {src ? <img src={src} alt={label} className="size-full object-cover" /> : <span className="grid size-full place-items-center text-[10px] text-muted">{empty ? '—' : '…'}</span>}
      </div>
      <figcaption className="mt-0.5 text-center text-[10px] text-muted">{label}</figcaption>
    </figure>
  );
}
