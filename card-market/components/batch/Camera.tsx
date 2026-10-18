'use client';
// Continuous capture (spec §10.3): rear camera, a card-shaped frame, tap to shoot the front, then the back
// (or skip it), then the next card — up to 10 in a row. A live sharpness reading tells the user when the
// printed text is crisp enough to read; text recognition runs in the background while they keep shooting.
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { BATCH_MAX, batch, useBatch } from '@/lib/batch';
import { useT } from '@/lib/i18n';
import { shrinkPhoto } from '@/lib/image';
import type { PhotoSide } from '@/lib/types';

const OUT_MAX = 1600; // longest side of a saved photo (spec §5)
const SHARP = 60; // Laplacian variance above which small text usually reads

/** Variance of the Laplacian on a small grey copy of the framed area: a cheap focus/blur score. */
function sharpness(g: CanvasRenderingContext2D, w: number, h: number) {
  const d = g.getImageData(0, 0, w, h).data;
  const grey = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) grey[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  let sum = 0, sq = 0, n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const l = 4 * grey[i] - grey[i - 1] - grey[i + 1] - grey[i - w] - grey[i + w];
      sum += l; sq += l * l; n++;
    }
  }
  const mean = sum / n;
  return sq / n - mean * mean;
}

export function BatchCamera({ onReview, onClose, defaultPublic }: { onReview: () => void; onClose: () => void; defaultPublic: boolean }) {
  const { t } = useT();
  const cards = useBatch();
  const video = useRef<HTMLVideoElement>(null);
  const frame = useRef<HTMLButtonElement>(null);
  const track = useRef<MediaStreamTrack | null>(null);
  const [camError, setCamError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [torchOk, setTorchOk] = useState(false);
  const [torch, setTorch] = useState(false);
  const [zoom, setZoom] = useState<1 | 2>(1);
  const [score, setScore] = useState(0);
  const [flashKey, setFlashKey] = useState(0);
  const [help, setHelp] = useState(false);
  const [sheet, setSheet] = useState<string | null>(null);
  // The card waiting for its back photo, and a retake the next tap should fill instead.
  const [awaitingBack, setAwaitingBack] = useState<string | null>(null);
  const [retake, setRetake] = useState<{ key: string; side: PhotoSide } | null>(null);
  const full = cards.length >= BATCH_MAX && !awaitingBack && !retake;
  const side: PhotoSide = retake?.side ?? (awaitingBack ? 'BACK' : 'FRONT');
  const current = retake ? cards.findIndex((c) => c.key === retake.key) + 1 : awaitingBack ? cards.findIndex((c) => c.key === awaitingBack) + 1 : cards.length + 1;

  // Rear camera, as sharp as the device offers.
  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) { setCamError(t('batch.noCamera')); return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
        if (stopped) { stream.getTracks().forEach((x) => x.stop()); return; }
        const v = video.current!;
        v.srcObject = stream;
        await v.play().catch(() => undefined);
        track.current = stream.getVideoTracks()[0] ?? null;
        const caps = (track.current?.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean };
        setTorchOk(!!caps.torch);
        setReady(true);
      } catch (e) {
        setCamError((e as Error)?.name === 'NotAllowedError' ? t('batch.denied') : t('batch.noCamera'));
      }
    })();
    return () => { stopped = true; stream?.getTracks().forEach((x) => x.stop()); };
  }, [t]);

  /** The part of the video under the frame, in video pixels (the video is object-cover, scaled by zoom). */
  const crop = useCallback(() => {
    const v = video.current, f = frame.current;
    if (!v || !f || !v.videoWidth) return null;
    const vr = v.getBoundingClientRect(), fr = f.getBoundingClientRect();
    const base = Math.max(vr.width / v.videoWidth, vr.height / v.videoHeight);
    const s = base * zoom;
    const ox = (vr.width - v.videoWidth * s) / 2, oy = (vr.height - v.videoHeight * s) / 2;
    const sx = Math.max(0, (fr.left - vr.left - ox) / s), sy = Math.max(0, (fr.top - vr.top - oy) / s);
    return { sx, sy, sw: Math.min(v.videoWidth - sx, fr.width / s), sh: Math.min(v.videoHeight - sy, fr.height / s) };
  }, [zoom]);

  // Live sharpness of the framed area, a few times a second.
  useEffect(() => {
    if (!ready) return;
    const c = document.createElement('canvas');
    c.width = 96; c.height = 134;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    const id = setInterval(() => {
      const r = crop();
      if (!r || !video.current) return;
      g.drawImage(video.current, r.sx, r.sy, r.sw, r.sh, 0, 0, c.width, c.height);
      setScore(sharpness(g, c.width, c.height));
    }, 300);
    return () => clearInterval(id);
  }, [ready, crop]);

  async function toggleTorch() {
    const next = !torch;
    try {
      await track.current?.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorch(next);
    } catch { setTorchOk(false); }
  }

  // The flow as of the last photo placed, so several gallery photos in one pick go front, back, front…
  // (state alone would still hold the step from before the pick).
  const flow = useRef({ retake, awaitingBack });
  flow.current = { retake, awaitingBack };

  /** Put a photo where the flow expects it: a retake, the waiting card's back, or a new card's front. */
  function place(blob: Blob) {
    const { retake: re, awaitingBack: waiting } = flow.current;
    if (re) {
      batch.setPhoto(re.key, re.side, blob);
      flow.current = { retake: null, awaitingBack: waiting };
      setRetake(null);
    } else if (waiting && batch.get().some((c) => c.key === waiting)) {
      batch.setPhoto(waiting, 'BACK', blob);
      flow.current = { retake: null, awaitingBack: null };
      setAwaitingBack(null);
    } else if (batch.get().length < BATCH_MAX) {
      const c = batch.add({ isPublic: defaultPublic });
      batch.setPhoto(c.key, 'FRONT', blob);
      flow.current = { retake: null, awaitingBack: c.key };
      setAwaitingBack(c.key);
    }
  }

  function shoot() {
    const r = crop();
    if (!r || full || !video.current) return;
    const k = Math.min(1, OUT_MAX / Math.max(r.sw, r.sh));
    const c = document.createElement('canvas');
    c.width = Math.round(r.sw * k);
    c.height = Math.round(r.sh * k);
    c.getContext('2d')!.drawImage(video.current, r.sx, r.sy, r.sw, r.sh, 0, 0, c.width, c.height);
    c.toBlob((b) => { if (b) place(b); }, 'image/jpeg', 0.9);
    setFlashKey((n) => n + 1);
    navigator.vibrate?.(25);
  }

  async function fromGallery(files: FileList | null) {
    for (const f of Array.from(files ?? [])) {
      try { place(await shrinkPhoto(f)); } catch { /* unreadable file: skip it */ }
    }
  }

  const sharp = score >= SHARP;
  const hint = full ? t('batch.full', { n: BATCH_MAX }) : retake ? t(`batch.retake.${retake.side}`) : t(`batch.tap.${side}`);
  const sheetCard = cards.find((c) => c.key === sheet);

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-black text-white select-none">
      <video ref={video} playsInline muted className="absolute inset-0 size-full object-cover" style={{ transform: `scale(${zoom})` }} />

      {/* top bar */}
      <div className="relative z-10 flex items-center justify-between px-4 pt-[max(12px,env(safe-area-inset-top))] pb-2">
        <Round label={t('batch.close')} onClick={onClose}>✕</Round>
        <div className="flex items-center gap-2 rounded-full bg-black/55 px-4 py-2 text-sm font-semibold backdrop-blur">
          <span aria-hidden className={`size-2.5 rounded-full ${!ready ? 'bg-white/40' : sharp ? 'bg-[#34d27b]' : 'bg-[#f5b544]'}`} />
          {!ready ? t('batch.starting') : full ? t('batch.fullShort') : `${t(`side.${side}`)} · ${current}/${BATCH_MAX} · ${sharp ? t('batch.sharp') : t('batch.steady')}`}
        </div>
        <div className="flex gap-2">
          <Round label={t('batch.help')} onClick={() => setHelp(true)}>?</Round>
          <Round label={t('batch.torch')} onClick={toggleTorch} disabled={!torchOk} active={torch}>{torch ? '⚡' : '⚡︎'}</Round>
        </div>
      </div>

      {/* frame */}
      <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center px-4 py-2">
        <button ref={frame} type="button" onClick={shoot} disabled={!ready || full} aria-label={hint}
          className="relative overflow-hidden rounded-[28px] border-2 border-white/85 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] disabled:border-white/40"
          style={{ aspectRatio: '63 / 88', width: 'min(100%, calc((100dvh - 330px) * 63 / 88))' }}>
          <span key={flashKey} className={flashKey ? 'pointer-events-none absolute inset-0 animate-[shutter_350ms_ease-out_forwards] bg-white' : 'hidden'} />
          <span className="absolute inset-x-6 top-1/2 -translate-y-1/2 text-center text-xl font-bold drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]">
            {camError ?? hint}
          </span>
          {awaitingBack && !retake && (
            <span className="absolute inset-x-0 top-4 flex justify-center">
              <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); setAwaitingBack(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); setAwaitingBack(null); } }}
                className="rounded-full bg-black/60 px-4 py-1.5 text-sm font-semibold backdrop-blur">{t('batch.skipBack')}</span>
            </span>
          )}
        </button>
        <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
          <div className="pointer-events-auto relative flex items-center" style={{ width: 'min(calc(100% - 32px), calc((100dvh - 330px) * 63 / 88))' }}>
            <div className="mx-auto">
              <Round label={t('batch.zoom')} onClick={() => setZoom(zoom === 1 ? 2 : 1)} size="lg" accent>{zoom}×</Round>
            </div>
            <label className="absolute right-3 grid size-14 cursor-pointer place-items-center rounded-full bg-black/60 text-2xl backdrop-blur" aria-label={t('batch.gallery')}>
              🖼
              <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { fromGallery(e.target.files); e.target.value = ''; }} />
            </label>
          </div>
        </div>
      </div>

      {/* recent scans */}
      <div className="relative z-10 bg-black/70 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="flex items-center justify-between px-5 pt-3">
          <span className="font-semibold">{t('batch.recent')}</span>
          <button type="button" onClick={onReview} disabled={!cards.length} className="font-semibold text-[#6cb2ff] disabled:text-white/30">
            {t('batch.next', { n: cards.length })}
          </button>
        </div>
        <div className="flex gap-3 overflow-x-auto px-5 py-3">
          <div className={`grid h-28 w-20 shrink-0 place-items-center rounded-2xl border-2 border-dashed text-center text-xs ${full ? 'border-white/15 text-white/30' : 'border-white/40 text-white/70'}`}>
            {full ? t('batch.fullShort') : t('batch.nextCard')}
          </div>
          {[...cards].reverse().map((c) => {
            const i = cards.indexOf(c) + 1;
            return (
              <button key={c.key} type="button" onClick={() => setSheet(c.key)} className="relative shrink-0 text-left">
                <div className="h-28 w-20 overflow-hidden rounded-2xl bg-white/10">
                  {/* Plain <img>: an in-memory photo (object URL). */}
                  {c.photos.FRONT && <img src={c.photos.FRONT.url} alt={`#${i}`} className="size-full object-cover" />}
                </div>
                <span className="absolute top-1 left-1 rounded-md bg-[#0b1f3a]/85 px-1.5 text-[11px] font-bold text-[#8cc4ff]">#{i}</span>
                <span className={`absolute right-1 bottom-1 rounded-md px-1.5 text-[11px] font-bold ${c.photos.BACK ? 'bg-[#123d26]/90 text-[#5ee39a]' : 'bg-black/70 text-white/70'}`}>
                  {c.photos.BACK ? t('batch.both') : t('batch.frontOnly')}
                </span>
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-2 px-10 pb-3 text-center text-[17px] font-bold">
          <span className="text-white">{t('batch.modeBatch')}</span>
          <Link href="/sell/new" className="text-white/45">{t('batch.modeSingle')}</Link>
        </div>
      </div>

      {help && (
        <Sheet onClose={() => setHelp(false)}>
          <h2 className="text-lg font-bold">{t('batch.help')}</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-[15px] text-white/85">
            <li>{t('batch.help1')}</li><li>{t('batch.help2')}</li><li>{t('batch.help3', { n: BATCH_MAX })}</li><li>{t('batch.help4')}</li>
          </ol>
          <button type="button" onClick={() => setHelp(false)} className="mt-5 w-full rounded-xl bg-white py-3 font-semibold text-black">{t('batch.gotIt')}</button>
        </Sheet>
      )}

      {sheetCard && (
        <Sheet onClose={() => setSheet(null)}>
          <h2 className="mb-3 text-lg font-bold">#{cards.indexOf(sheetCard) + 1}</h2>
          <div className="mb-4 flex gap-3">
            {(['FRONT', 'BACK'] as const).map((s) => (
              <div key={s} className="h-32 w-24 overflow-hidden rounded-xl bg-white/10">
                {sheetCard.photos[s] ? <img src={sheetCard.photos[s]!.url} alt={t(`side.${s}`)} className="size-full object-cover" /> : <span className="grid size-full place-items-center text-xs text-white/50">{t(`side.${s}`)}</span>}
              </div>
            ))}
          </div>
          <div className="grid gap-2">
            {(['FRONT', 'BACK'] as const).map((s) => (
              <SheetButton key={s} onClick={() => { setAwaitingBack(null); setRetake({ key: sheetCard.key, side: s }); setSheet(null); }}>
                {sheetCard.photos[s] ? t(`batch.retake.${s}`) : t(`batch.add.${s}`)}
              </SheetButton>
            ))}
            <SheetButton danger onClick={() => { if (awaitingBack === sheetCard.key) setAwaitingBack(null); batch.remove(sheetCard.key); setSheet(null); }}>{t('batch.delete')}</SheetButton>
            <SheetButton onClick={() => setSheet(null)}>{t('confirm.no')}</SheetButton>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function Round({ children, label, onClick, disabled, active, accent, size }: { children: ReactNode; label: string; onClick: () => void; disabled?: boolean; active?: boolean; accent?: boolean; size?: 'lg' }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled}
      className={`grid place-items-center rounded-full backdrop-blur disabled:opacity-35 ${size === 'lg' ? 'size-14 text-lg font-bold' : 'size-11 text-lg'} ${active ? 'bg-white text-black' : 'bg-black/55'} ${accent ? 'text-[#8cc4ff] ring-1 ring-[#2f6fd6]' : ''}`}>
      {children}
    </button>
  );
}

function Sheet({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-20 flex items-end bg-black/60" onClick={onClose}>
      <div role="dialog" className="w-full rounded-t-3xl bg-[#16181f] p-5 pb-[max(20px,env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}

const SheetButton = ({ children, onClick, danger }: { children: ReactNode; onClick: () => void; danger?: boolean }) => (
  <button type="button" onClick={onClick} className={`w-full rounded-xl bg-white/10 py-3 font-semibold ${danger ? 'text-[#ff7b7b]' : ''}`}>{children}</button>
);
