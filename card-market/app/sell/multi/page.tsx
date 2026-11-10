'use client';
// 一相多卡: one photo with 3–5 cards → the cards are found on the phone → the person confirms how many →
// each card is cut out, read and filled in → check, price, save all. A feature of its own: it shares the
// reading engine with batch scan but none of its screens or state.
import { useEffect, useState } from 'react';
import { ConfirmStep, MAX_CARDS, MIN_CARDS } from '@/components/multi/ConfirmStep';
import { ReviewStep } from '@/components/multi/ReviewStep';
import { RequireSignIn } from '@/components/RequireSignIn';
import { Notice, PageTitle } from '@/components/ui';
import { rotateImage, type Box } from '@/lib/detect';
import { useT } from '@/lib/i18n';
import { shrinkPhoto } from '@/lib/image';

export default function MultiPage() {
  return <RequireSignIn>{() => <Multi />}</RequireSignIn>;
}

type Step = { kind: 'photo' } | { kind: 'confirm'; img: HTMLImageElement; src: string } | { kind: 'review'; img: HTMLImageElement; boxes: Box[] };

function Multi() {
  const { t } = useT();
  const [step, setStep] = useState<Step>({ kind: 'photo' });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const src = step.kind === 'confirm' ? step.src : null;
  useEffect(() => () => { if (src) URL.revokeObjectURL(src); }, [src]);

  async function pick(file: File | undefined) {
    if (!file) return;
    setErr(null); setBusy(true);
    try {
      // Large enough to read each card's text once it is cut out; small enough for a phone.
      const blob = await shrinkPhoto(file, 3200);
      const url = URL.createObjectURL(blob);
      const img = new Image();
      await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error('img')); img.src = url; });
      setStep({ kind: 'confirm', img, src: url });
    } catch {
      setErr(t('err.PHOTO_UNREADABLE'));
    }
    setBusy(false);
  }

  const steps = ['multi.s1', 'multi.s2', 'multi.s3'] as const;
  const at = step.kind === 'photo' ? 0 : step.kind === 'confirm' ? 1 : 2;

  return (
    <div>
      <PageTitle title={`🖼️ ${t('multi.title')}`} sub={t('multi.sub', { min: MIN_CARDS, max: MAX_CARDS })} />
      <ol className="mb-5 flex gap-2 text-xs">
        {steps.map((k, i) => (
          <li key={k} className={`flex-1 rounded-full px-3 py-1.5 text-center font-semibold ${i === at ? 'bg-brand text-brand-ink' : i < at ? 'bg-ok-soft text-ok' : 'bg-surface-2 text-muted'}`}>
            {i < at ? '✓ ' : `${i + 1}. `}{t(k)}
          </li>
        ))}
      </ol>

      {step.kind === 'photo' && (
        <div className="mx-auto max-w-xl space-y-4">
          <div aria-hidden className="relative mx-auto grid h-44 max-w-sm grid-cols-4 items-center gap-3 rounded-3xl bg-[#3b2a1a] p-5">
            {['#FFCB05', '#8B5CF6', '#FF4D2E', '#12B76A'].map((c, i) => (
              <span key={c} className="aspect-[63/88] rounded-md border-2 border-white/80 shadow-lg" style={{ background: c, transform: `rotate(${(i - 1.5) * 3}deg)` }} />
            ))}
          </div>
          <ul className="space-y-1.5 rounded-2xl bg-surface p-4 text-sm">
            {(['multi.tip1', 'multi.tip2', 'multi.tip3', 'multi.tip4'] as const).map((k) => <li key={k}>✓ {t(k, { min: MIN_CARDS, max: MAX_CARDS })}</li>)}
          </ul>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className={`flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-accent px-5 py-4 text-lg font-bold text-[#17192c] ${busy ? 'opacity-60' : ''}`}>
              📷 {t('multi.take')}
              <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={busy} onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
            <label className={`flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-surface-2 px-5 py-4 font-semibold ${busy ? 'opacity-60' : ''}`}>
              🖼 {t('multi.choose')}
              <input type="file" accept="image/*" className="sr-only" disabled={busy} onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
          </div>
          {busy && <p className="text-center text-sm text-muted">⏳ {t('multi.finding')}</p>}
          {err && <Notice tone="danger">{err}</Notice>}
        </div>
      )}

      {err && step.kind !== 'photo' && <Notice tone="danger" className="mb-4">{err}</Notice>}
      {step.kind === 'confirm' && (
        <ConfirmStep key={step.src} img={step.img} src={step.src} onBack={() => setStep({ kind: 'photo' })}
          onConfirm={(boxes) => setStep({ kind: 'review', img: step.img, boxes })}
          onRotate={async (deg) => {
            try { const r = await rotateImage(step.img, deg); setStep({ kind: 'confirm', ...r }); }
            catch { setErr(t('err.PHOTO_UNREADABLE')); }
          }} />
      )}

      {step.kind === 'review' && <ReviewStep img={step.img} boxes={step.boxes} onRestart={() => setStep({ kind: 'photo' })} />}
    </div>
  );
}
