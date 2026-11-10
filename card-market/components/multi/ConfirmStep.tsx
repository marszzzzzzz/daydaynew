'use client';
// Step 2 of 一相多卡: the photo with a numbered frame on every card found. The person checks the count,
// removes wrong frames (✕), draws missing ones (drag on the photo), or detects again more or less
// sensitively, then confirms.
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Button, Notice } from '@/components/ui';
import { detectCards, readingOrder, type Box } from '@/lib/detect';
import { useT } from '@/lib/i18n';

export const MIN_CARDS = 3, MAX_CARDS = 5;

export function ConfirmStep({ img, src, onBack, onConfirm, onRotate }: {
  img: HTMLImageElement; src: string; onBack: () => void; onConfirm: (boxes: Box[]) => void;
  /** Turn the photo clockwise; the page swaps in the turned photo and this step starts over on it. */
  onRotate: (deg: 90 | 180 | 270) => Promise<void>;
}) {
  const { t } = useT();
  const [sens, setSens] = useState(50);
  const [boxes, setBoxes] = useState<Box[]>(() => detectCards(img, 50));
  const [found, setFound] = useState(boxes.length);
  const [turning, setTurning] = useState(false);
  const turn = async (deg: 90 | 180 | 270) => { setTurning(true); try { await onRotate(deg); } finally { setTurning(false); } };
  const [drawing, setDrawing] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const area = useRef<HTMLDivElement>(null);
  const W = img.naturalWidth, H = img.naturalHeight;

  // Re-detect when the sensitivity changes (after the slider settles).
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const id = setTimeout(() => { const b = detectCards(img, sens); setBoxes(b); setFound(b.length); }, 250);
    return () => clearTimeout(id);
  }, [sens, img]);

  const toPhoto = (e: PointerEvent) => {
    const r = area.current!.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * W, y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) * H };
  };
  const down = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    const p = toPhoto(e);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrawing({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
  };
  const move = (e: PointerEvent) => { if (drawing) { const p = toPhoto(e); setDrawing({ ...drawing, x1: p.x, y1: p.y }); } };
  const up = () => {
    if (!drawing) return;
    const b = { x: Math.min(drawing.x0, drawing.x1), y: Math.min(drawing.y0, drawing.y1), w: Math.abs(drawing.x1 - drawing.x0), h: Math.abs(drawing.y1 - drawing.y0) };
    setDrawing(null);
    if (b.w > W * 0.04 && b.h > H * 0.04) setBoxes((x) => readingOrder([...x, b])); // ignore taps and tiny drags; numbered in place
  };
  const pct = (b: Box) => ({ left: `${(b.x / W) * 100}%`, top: `${(b.y / H) * 100}%`, width: `${(b.w / W) * 100}%`, height: `${(b.h / H) * 100}%` });
  const n = boxes.length;
  const draft = drawing && { x: Math.min(drawing.x0, drawing.x1), y: Math.min(drawing.y0, drawing.y1), w: Math.abs(drawing.x1 - drawing.x0), h: Math.abs(drawing.y1 - drawing.y0) };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-surface p-4 text-center">
        <p className="text-sm text-muted">{t('multi.found', { n: found })}</p>
        <p className="mt-1 text-xl font-bold">{t('multi.confirmQ', { n })}</p>
        {(n < MIN_CARDS || n > MAX_CARDS) && <p className="mt-1 text-sm text-warn">{t('multi.outOfRange', { min: MIN_CARDS, max: MAX_CARDS })}</p>}
      </div>

      {/* Turn the photo upright: the cut-out cards come out the same way round. */}
      <div className="mx-auto flex max-w-xl flex-wrap items-center justify-center gap-2" role="group" aria-label={t('multi.rotate')}>
        <span className="hidden text-sm text-muted sm:inline">{t('multi.rotate')}</span>
        <Button variant="secondary" disabled={turning} onClick={() => turn(270)} aria-label={t('multi.rotateLeft')}>↺ {t('multi.rotateLeft')}</Button>
        <Button variant="secondary" disabled={turning} onClick={() => turn(90)} aria-label={t('multi.rotateRight')}>↻ {t('multi.rotateRight')}</Button>
        <Button variant="secondary" disabled={turning} onClick={() => turn(180)} aria-label={t('multi.rotate180')}>⇅ 180°</Button>
      </div>

      <div ref={area} className="relative mx-auto max-w-xl touch-none select-none overflow-hidden rounded-2xl bg-black"
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => setDrawing(null)}>
        <img src={src} alt={t('multi.photoAlt')} className="block w-full" draggable={false} />
        {boxes.map((b, i) => (
          <div key={`${i}:${Math.round(b.x)}:${Math.round(b.y)}`} className="absolute rounded-lg border-[3px] border-[#34d27b] bg-[#34d27b]/10 shadow-[0_0_0_1px_rgba(0,0,0,0.4)]" style={pct(b)}>
            <span className="absolute -top-0.5 -left-0.5 grid size-7 place-items-center rounded-br-lg bg-[#34d27b] text-sm font-extrabold text-[#0b1f12]">{i + 1}</span>
            <button type="button" onClick={() => setBoxes((x) => x.filter((_, j) => j !== i))} aria-label={t('multi.removeBox', { n: i + 1 })}
              className="absolute -top-0.5 -right-0.5 grid size-7 place-items-center rounded-bl-lg bg-black/70 text-sm font-bold text-white">✕</button>
          </div>
        ))}
        {draft && <div className="pointer-events-none absolute rounded-lg border-[3px] border-dashed border-accent" style={pct(draft)} />}
      </div>
      <p className="text-center text-xs text-muted">{t('multi.drawHint')} {t('multi.rotateHint')}</p>

      <label className="mx-auto flex max-w-xl items-center gap-3 text-sm">
        <span className="shrink-0 text-muted">{t('multi.sensitivity')}</span>
        <input type="range" min={0} max={100} value={sens} onChange={(e) => setSens(Number(e.target.value))} className="flex-1 accent-[var(--brand)]" />
      </label>

      {n === 0 && <Notice tone="warn">{t('multi.none')}</Notice>}
      <div className="flex flex-wrap justify-between gap-2">
        <Button variant="ghost" onClick={onBack}>← {t('multi.retake')}</Button>
        <Button disabled={n === 0} onClick={() => onConfirm(boxes)}>{t('multi.confirm', { n })}</Button>
      </div>
    </div>
  );
}
