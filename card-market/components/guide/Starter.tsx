'use client';
// The first thing a collector sees: a big "shoot your cards" button at the top of the home page, a
// starter checklist that walks a new seller from account to first public listing, and the celebration
// after the first batch is saved. Real cards are the main use, so every path starts at the camera.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { fetcher } from '@/lib/api';
import { sellerReady } from '@/lib/cards';
import { useT, type Key } from '@/lib/i18n';
import { markSeen, seen } from '@/lib/tour';
import type { Me, RealCard } from '@/lib/types';
import { ArtScan, Confetti } from './Art';

/** Top of the home page: the camera is the main way in. Signed out, it leads through sign-up to the camera. */
export function ScanHero({ signedIn }: { signedIn: boolean }) {
  const { t } = useT();
  const scan = signedIn ? '/sell/batch' : `/signup?next=${encodeURIComponent('/sell/batch')}`;
  return (
    <section className="relative mb-6 overflow-hidden rounded-3xl bg-[#121633] p-5 text-white sm:p-7">
      <div aria-hidden className="pointer-events-none absolute -right-4 -bottom-10 flex gap-2 opacity-80 motion-safe-anim sm:-top-6 sm:bottom-auto sm:opacity-90">
        {['#FFCB05', '#8B5CF6', '#FF4D2E'].map((c, i) => (
          <span key={c} className="h-20 w-14 rounded-lg border-2 border-white/70 shadow-lg sm:h-32 sm:w-24"
            style={{ background: c, ['--r' as string]: `${8 + i * 7}deg`, transform: `rotate(${8 + i * 7}deg)`, animation: `tour-float ${2.4 + i * 0.4}s ${i * 0.3}s ease-in-out infinite` }} />
        ))}
      </div>
      <div className="relative max-w-md">
        <p className="text-xs font-bold tracking-wider text-[#8cc4ff] uppercase">{t('start.kicker')}</p>
        <h1 className="mt-1 text-2xl font-extrabold leading-tight sm:text-3xl">{t('start.title')}</h1>
        <p className="mt-2 text-sm leading-relaxed text-white/80 sm:text-base">{t('start.sub')}</p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Link href={scan} data-tour="scan-cta"
            className="relative inline-flex items-center gap-2 rounded-2xl bg-accent px-6 py-4 text-lg font-bold text-[#17192c] shadow-lg motion-safe-anim"
            style={{ animation: 'tour-pulse 2s infinite' }}>
            <span aria-hidden className="text-2xl">📷</span>{t('start.cta')}
          </Link>
          {signedIn && <Link href="/sell/new" className="text-sm font-semibold text-white/80 underline-offset-4 hover:underline">{t('start.manual')}</Link>}
        </div>
        <ol className="mt-5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/70">
          {(['start.s1', 'start.s2', 'start.s3'] as Key[]).map((k, i) => <li key={k}><b className="text-white">{i + 1}</b> {t(k)}</li>)}
        </ol>
      </div>
    </section>
  );
}

interface Task { key: Key; hint: Key; done: boolean; href: string }

/** Starter checklist: account → first card → WhatsApp → first public listing. Hidden once done or dismissed. */
export function StarterChecklist({ me }: { me: Me }) {
  const { t } = useT();
  const { data: cards } = useSWR<RealCard[] | null>('real-cards', fetcher);
  const [hidden, setHidden] = useState(true);
  useEffect(() => setHidden(seen('checklist')), []);
  if (hidden || cards === undefined) return null;
  const list = cards ?? [];
  const tasks: Task[] = [
    { key: 'check.account', hint: 'check.account.d', done: true, href: '/account' },
    { key: 'check.card', hint: 'check.card.d', done: list.length > 0, href: '/sell/batch' },
    { key: 'check.whatsapp', hint: 'check.whatsapp.d', done: sellerReady(me), href: '/account' },
    { key: 'check.list', hint: 'check.list.d', done: list.some((c) => c.marketPublic), href: '/sell' },
  ];
  const done = tasks.filter((x) => x.done).length;
  if (done === tasks.length) return null;
  const next = tasks.find((x) => !x.done)!;

  return (
    <section data-tour="checklist" className="mb-6 rounded-3xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-bold">{t('check.title')}</h2>
          <p className="text-xs text-muted">{t('check.progress', { done, total: tasks.length })}</p>
        </div>
        <button type="button" onClick={() => { markSeen('checklist'); setHidden(true); }} className="text-xs text-muted hover:text-ink">{t('check.hide')}</button>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
        <div className="motion-safe-anim h-full rounded-full bg-ok transition-all duration-700" style={{ width: `${(done / tasks.length) * 100}%`, animation: 'tour-fill 900ms ease-out' }} />
      </div>
      <ol className="mt-3 grid gap-2 sm:grid-cols-2">
        {tasks.map((x, n) => {
          const current = x === next;
          return (
            <li key={x.key}>
              <Link href={x.href}
                className={`flex items-start gap-3 rounded-2xl border p-3 transition ${current ? 'border-brand bg-brand/5' : 'border-line'} ${x.done ? 'opacity-70' : 'hover:border-brand'}`}>
                <span className={`grid size-7 shrink-0 place-items-center rounded-full text-sm font-bold ${x.done ? 'bg-ok text-white' : current ? 'bg-brand text-brand-ink' : 'bg-surface-2 text-muted'}`}
                  style={current ? { animation: 'tour-pulse 1.8s infinite' } : undefined}>
                  {x.done ? '✓' : n + 1}
                </span>
                <span className="min-w-0">
                  <span className={`block text-sm font-semibold ${x.done ? 'line-through' : ''}`}>{t(x.key)}</span>
                  <span className="block text-xs text-muted">{t(x.hint)}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** After the first saved batch: confetti and the one next step that matters. Shown once. */
export function FirstSaveCelebration({ count, me, onClose }: { count: number; me: Me | null | undefined; onClose: () => void }) {
  const { t } = useT();
  const ready = sellerReady(me);
  const close = () => { markSeen('firstSave'); onClose(); };
  return (
    <>
      <Confetti />
      <div className="fixed inset-0 z-[85] grid place-items-center bg-[rgba(8,10,20,0.6)] p-4" role="dialog" aria-modal="true" aria-labelledby="celebrate-title">
        <div className="motion-safe-anim w-full max-w-sm rounded-3xl bg-surface p-5 text-center shadow-2xl" style={{ animation: 'tour-pop 300ms ease-out' }}>
          <div className="text-5xl" aria-hidden>🎉</div>
          <h2 id="celebrate-title" className="mt-2 text-xl font-bold">{t('celebrate.title', { n: count })}</h2>
          <p className="mt-1 text-sm text-muted">{t(ready ? 'celebrate.ready' : 'celebrate.notReady')}</p>
          <div className="mt-4"><ArtScan /></div>
          <div className="mt-5 grid gap-2">
            <Link href={ready ? '/sell' : '/account'} onClick={close} className="rounded-xl bg-brand px-4 py-3 font-semibold text-brand-ink">
              {t(ready ? 'celebrate.toCards' : 'celebrate.setWhatsApp')}
            </Link>
            <button type="button" onClick={close} className="rounded-xl px-4 py-2.5 text-sm font-medium text-muted hover:bg-surface-2">{t('celebrate.later')}</button>
          </div>
        </div>
      </div>
    </>
  );
}
