'use client';
// Guided tour: dims the page, cuts a pulsing spotlight around the element a step points at
// (data-tour="…"), and shows a speech bubble with an animated illustration, step dots and
// Back / Next / Skip. Steps without a target show the bubble in the middle of the screen.
// Finishing or skipping marks the tour as seen (lib/tour.ts) so it doesn't come back by itself.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useT, type Key } from '@/lib/i18n';
import { markSeen, seen, type TourId } from '@/lib/tour';

export interface TourStep {
  /** data-tour value of the element to spotlight; the first visible match is used. */
  target?: string;
  title: Key;
  body: Key;
  vars?: Record<string, string | number>;
  art?: ReactNode;
}

const PAD = 8;
const GAP = 14;

/** Opens a tour by itself the first time (after `delay`), once `ready` is true. */
export function useTour(id: TourId, ready = true, delay = 700) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!ready || seen(id)) return;
    const timer = setTimeout(() => setOpen(true), delay);
    return () => clearTimeout(timer);
  }, [id, ready, delay]);
  return { open, start: () => setOpen(true), close: () => setOpen(false) };
}

function findTarget(name?: string): HTMLElement | null {
  if (!name) return null;
  const all = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`));
  return all.find((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }) ?? null;
}

export function Tour({ id, steps, open, onClose, finish }: {
  id: TourId; steps: TourStep[]; open: boolean; onClose: () => void;
  /** The last step's button: label and what it does (e.g. go to the camera). */
  finish?: { label: Key; action: () => void };
}) {
  const { t } = useT();
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [view, setView] = useState({ w: 0, h: 0 });
  const nextBtn = useRef<HTMLButtonElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [bubbleH, setBubbleH] = useState(0);
  const step = steps[Math.min(i, steps.length - 1)];
  const last = i >= steps.length - 1;

  const end = useCallback((then?: () => void) => {
    markSeen(id);
    setI(0);
    onClose();
    then?.();
  }, [id, onClose]);

  // Find the step's element, bring it into view, then keep the spotlight on it while things move.
  useLayoutEffect(() => {
    if (!open) return;
    const el = findTarget(step?.target);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setView({ w: window.innerWidth, h: window.innerHeight });
        setRect(findTarget(step?.target)?.getBoundingClientRect() ?? null);
      });
    };
    measure();
    // Targets move and resize on their own (smooth scroll, the camera frame once video starts).
    const poll = setInterval(measure, 300);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(poll);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [open, i, step?.target]);

  // The bubble's real height decides where it fits.
  useLayoutEffect(() => {
    if (open && bubbleRef.current) setBubbleH(bubbleRef.current.offsetHeight);
  });

  useEffect(() => {
    if (!open) return;
    nextBtn.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') end();
      if (e.key === 'ArrowRight' && !last) setI((n) => n + 1);
      if (e.key === 'ArrowLeft' && i > 0) setI((n) => n - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, i, last, end]);

  if (!open || !step || typeof document === 'undefined') return null;

  // Bubble below the spotlight if it fits, else above, else pinned to the bottom of the screen over the
  // target (a big target like the camera frame leaves room on neither side). Centred without a target.
  const width = Math.min(360, view.w - 32);
  const h = Math.min(bubbleH || 320, view.h - 32);
  let bubble: CSSProperties;
  if (rect) {
    const left = Math.max(16, Math.min(rect.left + rect.width / 2 - width / 2, view.w - width - 16));
    const below = rect.bottom + PAD + GAP;
    const above = rect.top - PAD - GAP - h;
    const top = below + h <= view.h - 16 ? below : above >= 16 ? above : view.h - 16 - h;
    bubble = { left, top: Math.max(16, top), width };
  } else {
    bubble = { left: '50%', top: '50%', width, transform: 'translate(-50%, -50%)' };
  }

  return createPortal(
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {rect ? (
        <div className="pointer-events-none absolute rounded-2xl transition-all duration-300 ease-out motion-safe-anim"
          style={{
            left: rect.left - PAD, top: rect.top - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2,
            boxShadow: '0 0 0 9999px rgba(8,10,20,0.68)',
          }}>
          <span className="absolute inset-0 rounded-2xl border-2 border-accent" style={{ animation: 'tour-pulse 1.6s infinite' }} />
        </div>
      ) : (
        <div className="absolute inset-0 bg-[rgba(8,10,20,0.72)]" />
      )}
      {/* Clicks outside the bubble do nothing: the tour moves only with its own buttons. */}
      <div className="absolute inset-0" />

      <div key={i} ref={bubbleRef} className="motion-safe-anim absolute overflow-y-auto rounded-3xl bg-surface p-4 text-ink shadow-2xl"
        style={{ ...bubble, maxHeight: view.h ? view.h - 32 : undefined, animation: 'tour-pop 260ms ease-out' }}>
        {step.art && <div className="mb-3">{step.art}</div>}
        <p className="text-xs font-bold tracking-wide text-brand">{t('tour.step', { n: i + 1, total: steps.length })}</p>
        <h2 id="tour-title" className="mt-0.5 text-lg font-bold">{t(step.title, step.vars)}</h2>
        <p className="mt-1 text-[15px] leading-relaxed text-muted">{t(step.body, step.vars)}</p>
        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex gap-1.5" aria-hidden>
            {steps.map((_, n) => <span key={n} className={`h-1.5 rounded-full transition-all ${n === i ? 'w-5 bg-brand' : 'w-1.5 bg-line'}`} />)}
          </div>
          <div className="flex items-center gap-1">
            {!last && <button type="button" onClick={() => end()} className="rounded-lg px-2.5 py-2 text-sm text-muted hover:text-ink">{t('tour.skip')}</button>}
            {i > 0 && <button type="button" onClick={() => setI(i - 1)} className="rounded-lg px-2.5 py-2 text-sm font-medium hover:bg-surface-2">{t('tour.back')}</button>}
            <button ref={nextBtn} type="button"
              onClick={() => (last ? end(finish?.action) : setI(i + 1))}
              className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-ink">
              {last ? t(finish?.label ?? 'tour.done') : t('tour.next')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
