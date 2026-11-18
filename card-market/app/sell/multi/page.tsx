'use client';
// 一相多卡: one photo with 3–5 cards → the cards are found on the phone → the person confirms how many →
// the same for their backs (or skip) → backs paired with fronts → each card cut out, read and filled in →
// check, price, save all. A feature of its own: it shares the reading engine with batch scan but none
// of its screens or state.
import { useEffect, useState } from 'react';
import { ConfirmStep, MAX_CARDS, MIN_CARDS } from '@/components/multi/ConfirmStep';
import { PairStep } from '@/components/multi/PairStep';
import { ReviewStep } from '@/components/multi/ReviewStep';
import { RequireSignIn } from '@/components/RequireSignIn';
import { Button, Notice, PageTitle } from '@/components/ui';
import { rotateImage, type Shot } from '@/lib/detect';
import { useT } from '@/lib/i18n';
import { shrinkPhoto } from '@/lib/image';

export default function MultiPage() {
  return <RequireSignIn>{() => <Multi />}</RequireSignIn>;
}

// The same cards are shot twice: fronts, then (turned over where they lie) backs. Each side is
// confirmed on its own; then the backs are paired with the fronts.
type Side = 'FRONT' | 'BACK';
type Step =
  | { kind: 'photo'; side: Side; front?: Shot }
  | { kind: 'confirm'; side: Side; img: HTMLImageElement; src: string; front?: Shot }
  | { kind: 'pair'; front: Shot; back: Shot }
  | { kind: 'review'; front: Shot; back: Shot | null; pairs: number[] };

function Multi() {
  const { t } = useT();
  const [step, setStep] = useState<Step>({ kind: 'photo', side: 'FRONT' });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const src = step.kind === 'confirm' ? step.src : null;
  useEffect(() => () => { if (src) URL.revokeObjectURL(src); }, [src]);

  async function pick(file: File | undefined, side: Side, front?: Shot) {
    if (!file) return;
    setErr(null); setBusy(true);
    try {
      // Large enough to read each card's text once it is cut out; small enough for a phone.
      const blob = await shrinkPhoto(file, 3200);
      const url = URL.createObjectURL(blob);
      const img = new Image();
      await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error('img')); img.src = url; });
      setStep({ kind: 'confirm', side, img, src: url, front });
    } catch {
      setErr(t('err.PHOTO_UNREADABLE'));
    }
    setBusy(false);
  }

  const steps = ['multi.s1', 'multi.sBack', 'multi.sPair', 'multi.s3'] as const;
  const at = step.kind === 'review' ? 3 : step.kind === 'pair' ? 2 : step.side === 'BACK' ? 1 : 0;
  const restart = () => setStep({ kind: 'photo', side: 'FRONT' });

  return (
    <div>
      <PageTitle title={`🖼️ ${t('multi.title')}`} sub={t('multi.sub', { min: MIN_CARDS, max: MAX_CARDS })} />
      <ol className="mb-5 grid grid-cols-4 gap-1.5 text-[11px] sm:text-xs">
        {steps.map((k, i) => (
          <li key={k} className={`rounded-full px-2 py-1.5 text-center font-semibold ${i === at ? 'bg-brand text-brand-ink' : i < at ? 'bg-ok-soft text-ok' : 'bg-surface-2 text-muted'}`}>
            {i < at ? '✓ ' : `${i + 1}. `}{t(k)}
          </li>
        ))}
      </ol>

      {step.kind === 'photo' && (
        <PhotoPick side={step.side} count={step.front?.boxes.length} busy={busy} err={err}
          onPick={(f) => pick(f, step.side, step.front)}
          onSkip={step.front ? () => setStep({ kind: 'review', front: step.front!, back: null, pairs: [] }) : undefined}
          onBack={step.front ? restart : undefined} />
      )}

      {err && step.kind !== 'photo' && <Notice tone="danger" className="mb-4">{err}</Notice>}
      {step.kind === 'confirm' && (
        <>
          {step.side === 'BACK' && <p className="mb-3 text-center text-sm font-semibold">{t('multi.backOf', { n: step.front?.boxes.length ?? 0 })}</p>}
          <ConfirmStep key={step.src} img={step.img} src={step.src} expected={step.front?.boxes.length}
            onBack={() => setStep({ kind: 'photo', side: step.side, front: step.front })}
            onConfirm={(boxes) => setStep(step.side === 'FRONT'
              ? { kind: 'photo', side: 'BACK', front: { img: step.img, boxes } }
              : { kind: 'pair', front: step.front!, back: { img: step.img, boxes } })}
            onRotate={async (deg) => {
              try { const r = await rotateImage(step.img, deg); setStep({ ...step, ...r }); }
              catch { setErr(t('err.PHOTO_UNREADABLE')); }
            }} />
        </>
      )}

      {step.kind === 'pair' && (
        <PairStep front={step.front} back={step.back}
          onBack={() => setStep({ kind: 'photo', side: 'BACK', front: step.front })}
          onConfirm={(pairs) => setStep({ kind: 'review', front: step.front, back: step.back, pairs })} />
      )}

      {step.kind === 'review' && <ReviewStep front={step.front} back={step.back} pairs={step.pairs} onRestart={restart} />}
    </div>
  );
}

/** Take or choose the photo of one side. For the backs: say how to turn the cards over, or skip. */
function PhotoPick({ side, count, busy, err, onPick, onSkip, onBack }: {
  side: Side; count?: number; busy: boolean; err: string | null;
  onPick: (f: File | undefined) => void; onSkip?: () => void; onBack?: () => void;
}) {
  const { t } = useT();
  const back = side === 'BACK';
  const tips = back ? (['multi.backTip1', 'multi.backTip2', 'multi.tip4'] as const) : (['multi.tip1', 'multi.tip2', 'multi.tip3', 'multi.tip4'] as const);
  return (
    <div className="mx-auto max-w-xl space-y-4">
      {back && <h2 className="text-center text-lg font-bold">{t('multi.backTitle', { n: count ?? 0 })}</h2>}
      <div aria-hidden className="relative mx-auto grid h-44 max-w-sm grid-cols-4 items-center gap-3 rounded-3xl bg-[#3b2a1a] p-5">
        {['#FFCB05', '#8B5CF6', '#FF4D2E', '#12B76A'].map((c, i) => (
          <span key={c} className="aspect-[63/88] rounded-md border-2 border-white/80 shadow-lg"
            style={{ background: back ? 'repeating-linear-gradient(45deg,#2a63d8 0 6px,#3b74ea 6px 12px)' : c, transform: `rotate(${(i - 1.5) * 3}deg)` }} />
        ))}
      </div>
      <ul className="space-y-1.5 rounded-2xl bg-surface p-4 text-sm">
        {tips.map((k) => <li key={k}>✓ {t(k, { min: MIN_CARDS, max: MAX_CARDS })}</li>)}
      </ul>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className={`flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-accent px-5 py-4 text-lg font-bold text-[#17192c] ${busy ? 'opacity-60' : ''}`}>
          📷 {t(back ? 'multi.takeBack' : 'multi.take')}
          <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={busy} onChange={(e) => { onPick(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
        <label className={`flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-surface-2 px-5 py-4 font-semibold ${busy ? 'opacity-60' : ''}`}>
          🖼 {t('multi.choose')}
          <input type="file" accept="image/*" className="sr-only" disabled={busy} onChange={(e) => { onPick(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
      </div>
      {busy && <p className="text-center text-sm text-muted">⏳ {t('multi.finding')}</p>}
      {err && <Notice tone="danger">{err}</Notice>}
      {(onSkip || onBack) && (
        <div className="flex flex-wrap justify-between gap-2">
          {onBack ? <Button variant="ghost" onClick={onBack}>← {t('multi.restart')}</Button> : <span />}
          {onSkip && <Button variant="secondary" onClick={onSkip}>{t('multi.skipBacks')} →</Button>}
        </div>
      )}
    </div>
  );
}
