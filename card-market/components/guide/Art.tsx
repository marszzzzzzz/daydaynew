// Small looping illustrations for the guided tour: each one acts out a single step (card into the frame,
// tap when sharp, flip for the back, the batch filling up, tapping text into a field, typing a price).
// Pure CSS keyframes from globals.css; with reduced motion they rest on their final frame.
import type { CSSProperties, ReactNode } from 'react';

const LOOP = '2.8s ease-in-out infinite';

function Stage({ children, dark = true }: { children: ReactNode; dark?: boolean }) {
  return (
    <div aria-hidden className={`motion-safe-anim relative mx-auto h-36 w-full max-w-[260px] overflow-hidden rounded-2xl ${dark ? 'bg-[#0f1220]' : 'bg-surface-2'}`}>
      {children}
    </div>
  );
}

/** The trading card used in the scenes: yellow border, art box, a name and a number. */
function MiniCard({ style, back }: { style?: CSSProperties; back?: boolean }) {
  return back ? (
    <div className="absolute inset-0 rounded-[7px] border-[3px] border-[#1f4fb8] bg-[repeating-linear-gradient(45deg,#2a63d8_0_6px,#3b74ea_6px_12px)] [backface-visibility:hidden] [transform:rotateY(180deg)]" style={style}>
      <span className="absolute inset-0 m-auto size-6 rounded-full border-4 border-white/80 bg-[#e8443a]" />
    </div>
  ) : (
    <div className="absolute inset-0 flex flex-col gap-1 rounded-[7px] border-[3px] border-[#f2c200] bg-[#fff6cf] p-1 [backface-visibility:hidden]" style={style}>
      <span className="h-1.5 w-2/3 rounded bg-[#222]" />
      <span className="flex-1 rounded-sm bg-gradient-to-br from-[#ffd84a] to-[#e88b2a]" />
      <span className="h-1 w-1/3 self-end rounded bg-[#555]" />
    </div>
  );
}

/** 1. Put the card in the frame: it slides in and the frame turns green. */
export function ArtFrame() {
  return (
    <Stage>
      <div className="absolute top-1/2 left-1/2 h-[104px] w-[76px] -translate-x-1/2 -translate-y-1/2 rounded-xl border-2 border-dashed" style={{ animation: `tour-frame-glow ${LOOP}`, borderColor: '#34d27b' }} />
      <div className="absolute top-1/2 left-1/2 h-[92px] w-[66px]" style={{ animation: `tour-card-in ${LOOP}`, transform: 'translate(-50%,-50%)' }}>
        <MiniCard />
      </div>
    </Stage>
  );
}

/** 2. Green dot = sharp; tap inside the frame (finger, ripple, shutter flash). */
export function ArtTap() {
  return (
    <Stage>
      <span className="absolute top-2 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-0.5 text-[10px] font-semibold text-white">
        <span className="size-2 rounded-full bg-[#34d27b]" style={{ animation: 'tour-pulse 1.4s infinite' }} /> OK
      </span>
      <div className="absolute top-[58%] left-1/2 h-[92px] w-[66px] -translate-x-1/2 -translate-y-1/2 rounded-xl border-2 border-[#34d27b] p-[3px]">
        <div className="relative size-full"><MiniCard /></div>
        <span className="absolute inset-0 rounded-xl bg-white" style={{ animation: `tour-flash ${LOOP}`, opacity: 0 }} />
      </div>
      <span className="absolute top-[58%] left-1/2 -mt-4 -ml-4 size-8 rounded-full border-2 border-white" style={{ animation: `tour-ripple ${LOOP}`, opacity: 0 }} />
      <span className="absolute top-[58%] left-1/2 text-3xl" style={{ animation: `tour-tap ${LOOP}` }}>👆</span>
    </Stage>
  );
}

/** 3. Flip the card over for the back. */
export function ArtFlip() {
  return (
    <Stage>
      <div className="absolute top-1/2 left-1/2 h-[92px] w-[66px] -translate-x-1/2 -translate-y-1/2 [perspective:400px]">
        <div className="relative size-full [transform-style:preserve-3d]" style={{ animation: `tour-flip 3.2s ease-in-out infinite` }}>
          <MiniCard />
          <MiniCard back />
        </div>
      </div>
      <span className="absolute right-4 bottom-3 text-2xl" style={{ animation: 'tour-float 1.6s ease-in-out infinite' }}>🔄</span>
    </Stage>
  );
}

/** 4. One after another, up to 10: thumbnails pile into the strip and the counter climbs. */
export function ArtStack() {
  return (
    <Stage>
      <div className="absolute inset-x-3 bottom-3 flex gap-2">
        <div className="grid h-14 w-10 shrink-0 place-items-center rounded-lg border-2 border-dashed border-white/40 text-lg text-white/60">＋</div>
        {[0, 1, 2].map((i) => (
          <div key={i} className="relative h-14 w-10 shrink-0" style={{ animation: `tour-stack 3.6s ${i * 0.45}s ease-out infinite` }}>
            <MiniCard />
            <span className="absolute -top-1.5 -left-1.5 rounded bg-[#0b1f3a] px-1 text-[9px] font-bold text-[#8cc4ff]">#{i + 1}</span>
          </div>
        ))}
      </div>
      <span className="absolute top-3 left-3 rounded-full bg-black/60 px-2.5 py-0.5 text-xs font-bold text-white">3 / 10</span>
      <span className="absolute top-3 right-3 text-xs font-bold text-[#6cb2ff]">→</span>
    </Stage>
  );
}

/** 5. Tap the recognised text and it lands in the field. */
export function ArtPick() {
  return (
    <Stage dark={false}>
      <div className="absolute inset-x-4 top-4 flex flex-wrap gap-1.5">
        <span className="rounded-full border border-line px-2.5 py-1 text-xs font-semibold" style={{ animation: `tour-chip ${LOOP}`, background: 'var(--brand)', color: 'var(--brand-ink)' }}>PIKACHU</span>
        <span className="rounded-full border border-line bg-surface px-2.5 py-1 text-xs">#025/165</span>
        <span className="rounded-full border border-line bg-surface px-2.5 py-1 text-xs">Base Set</span>
      </div>
      <span className="absolute top-3 left-14 text-2xl" style={{ animation: `tour-tap ${LOOP}` }}>👆</span>
      <div className="absolute inset-x-4 bottom-4 rounded-xl border border-brand bg-surface px-3 py-2 text-sm">
        <span className="inline-block overflow-hidden align-bottom font-semibold whitespace-nowrap" style={{ animation: `tour-type ${LOOP} steps(7)`, ['--w' as string]: '7ch', width: '7ch' }}>PIKACHU</span>
        <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-brand align-middle" />
      </div>
    </Stage>
  );
}

/** 6. Type the asking price. */
export function ArtPrice() {
  return (
    <Stage dark={false}>
      <span className="absolute top-4 left-4 text-xs font-semibold text-muted">HK$</span>
      <div className="absolute inset-x-4 top-9 rounded-xl border border-brand bg-surface px-3 py-2 text-lg font-bold">
        <span className="inline-block overflow-hidden align-bottom whitespace-nowrap" style={{ animation: `tour-type ${LOOP} steps(3)`, ['--w' as string]: '3ch', width: '3ch' }}>120</span>
        <span className="ml-0.5 inline-block h-5 w-0.5 animate-pulse bg-brand align-middle" />
      </div>
      <div className="absolute inset-x-4 bottom-4 flex gap-1.5">
        {['簽名 Auto', '限號 23/99'].map((x) => <span key={x} className="rounded-md bg-brand/10 px-1.5 py-0.5 text-[11px] font-medium text-brand">{x}</span>)}
      </div>
    </Stage>
  );
}

/** Reading the card: a scan line sweeps over it. */
export function ArtScan() {
  return (
    <Stage>
      <div className="absolute top-1/2 left-1/2 h-[104px] w-[76px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-lg">
        <MiniCard />
        <span className="absolute inset-x-0 h-0.5 bg-[#6cb2ff] shadow-[0_0_12px_3px_#6cb2ff]" style={{ animation: 'tour-scan 2.2s ease-in-out infinite', top: '50%' }} />
      </div>
      <span className="absolute right-3 bottom-3 rounded-md bg-black/60 px-1.5 text-[10px] font-semibold text-[#8cc4ff]">Aa 中 あ 한</span>
    </Stage>
  );
}

/** Confetti for the first saved batch (pieces fall once). */
export function Confetti() {
  const colors = ['#FFCB05', '#8B5CF6', '#FF4D2E', '#34d27b', '#6cb2ff'];
  return (
    <div aria-hidden className="motion-safe-anim pointer-events-none fixed inset-0 z-[90] overflow-hidden">
      {Array.from({ length: 36 }, (_, i) => (
        <span key={i} className="absolute top-0 h-3 w-2 rounded-sm"
          style={{ left: `${(i * 37) % 100}%`, background: colors[i % colors.length], animation: `confetti-fall ${2.2 + (i % 5) * 0.35}s ${(i % 7) * 0.12}s ease-in forwards`, opacity: 0 }} />
      ))}
    </div>
  );
}
