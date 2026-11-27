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
import { Camera, Check } from 'lucide-react';
import { ArtScan } from './Art';

/**
 * Top of the home page: the camera is the main way in. Signed out, it leads through sign-up to the camera.
 * `compact` (a collector who already has cards): one slim bar, so the market starts on the first screen.
 */
export function ScanHero({ signedIn, compact }: { signedIn: boolean; compact?: boolean }) {
  const { t } = useT();
  const scan = signedIn ? '/sell/batch' : `/signup?next=${encodeURIComponent('/sell/batch')}`;
  if (compact) {
    return (
      <section className="mb-8 flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-line py-3">
        <p className="w-full text-sm text-muted sm:w-auto sm:min-w-0 sm:flex-1">{t('start.compact')}</p>
        <Link href="/sell/new" className="ml-auto text-sm text-muted underline-offset-4 hover:text-ink hover:underline sm:ml-0">{t('start.manualShort')}</Link>
        <Link href={scan} data-tour="scan-cta" className="lamp inline-flex items-center gap-2 rounded-lg bg-shelf px-4 py-2 text-sm font-medium text-bg">
          <Camera aria-hidden size={16} strokeWidth={1.75} />{t('start.cta')}
        </Link>
      </section>
    );
  }
  return (
    <section className="relative mb-12 pt-4 sm:pt-10">
      <div aria-hidden className="planet -top-24 -right-40 size-72 opacity-80 sm:-top-16 sm:-right-16 sm:size-96" />
      <p className="relative text-xs font-medium tracking-[0.3em] text-accent uppercase">{t('start.kicker')}</p>
      <h1 className="display cosmic relative mt-3 max-w-3xl text-4xl text-balance sm:text-6xl">{t('start.title')}</h1>
      <p className="relative mt-4 max-w-xl text-[15px] leading-relaxed text-muted">{t('start.sub')}</p>
      <div className="relative mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
        <Link href={scan} data-tour="scan-cta"
          className="lamp inline-flex items-center gap-3 rounded-lg bg-shelf px-6 py-4 text-base font-medium text-bg shadow-[0_0_40px_-6px_var(--glow)]">
          <Camera aria-hidden size={22} strokeWidth={1.75} />{t('start.cta')}
        </Link>
        {signedIn
          ? <Link href="/sell/new" className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline">{t('start.manual')}</Link>
          : <Link href="/login" className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline">{t('start.haveAccount')}</Link>}
      </div>
      {/* An empty shelf waiting for cards: the three steps stand on it. */}
      <ol className="shelf mt-12 grid grid-cols-3 gap-3 sm:gap-6">
        {(['start.s1', 'start.s2', 'start.s3'] as Key[]).map((k, i) => (
          <li key={k} className="acrylic shelve flex aspect-[63/50] flex-col justify-between rounded-sm p-3 sm:aspect-[63/40] sm:p-4" style={{ animationDelay: `${i * 90}ms` }}>
            <span className="display text-2xl text-muted sm:text-3xl">0{i + 1}</span>
            <span className="text-xs leading-snug sm:text-sm">{t(k)}</span>
          </li>
        ))}
      </ol>
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
    <section data-tour="checklist" className="mb-10 rounded-md border border-line bg-surface p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="display text-lg">{t('check.title')}</h2>
          <p className="text-xs text-muted">{t('check.progress', { done, total: tasks.length })}</p>
        </div>
        <button type="button" onClick={() => { markSeen('checklist'); setHidden(true); }} className="text-xs text-muted hover:text-ink">{t('check.hide')}</button>
      </div>
      <div className="mt-3 h-0.5 overflow-hidden bg-surface-2">
        <div className="h-full bg-shelf shadow-[0_0_10px_var(--glow)] transition-all duration-700" style={{ width: `${(done / tasks.length) * 100}%` }} />
      </div>
      <ol className="mt-3 grid gap-2 sm:grid-cols-2">
        {tasks.map((x, n) => {
          const current = x === next;
          return (
            <li key={x.key}>
              <Link href={x.href}
                className={`flex items-start gap-3 rounded-md border p-3 transition ${current ? 'border-white/40' : 'border-line'} ${x.done ? 'opacity-60' : 'hover:border-white/40'}`}>
                <span className={`grid size-7 shrink-0 place-items-center rounded-full text-sm font-medium ${x.done ? 'bg-surface-2 text-ok' : current ? 'bg-shelf text-bg' : 'border border-line text-muted'}`}>
                  {x.done ? <Check aria-hidden size={14} strokeWidth={2.5} /> : n + 1}
                </span>
                <span className="min-w-0">
                  <span className={`block text-sm font-medium ${x.done ? 'line-through' : ''}`}>{t(x.key)}</span>
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
      <div className="fixed inset-0 z-[85] grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="celebrate-title">
        <div className="motion-safe-anim w-full max-w-sm rounded-md border border-line bg-surface p-6 text-center" style={{ animation: 'tour-pop 300ms ease-out' }}>
          <h2 id="celebrate-title" className="display text-2xl">{t('celebrate.title', { n: count })}</h2>
          <p className="mt-1 text-sm text-muted">{t(ready ? 'celebrate.ready' : 'celebrate.notReady')}</p>
          <div className="mt-4"><ArtScan /></div>
          <div className="mt-5 grid gap-2">
            <Link href={ready ? '/sell' : '/account'} onClick={close} className="rounded-lg bg-brand px-4 py-3 font-medium text-brand-ink">
              {t(ready ? 'celebrate.toCards' : 'celebrate.setWhatsApp')}
            </Link>
            <button type="button" onClick={close} className="rounded-lg px-4 py-2.5 text-sm font-medium text-muted hover:bg-surface-2">{t('celebrate.later')}</button>
          </div>
        </div>
      </div>
    </>
  );
}
