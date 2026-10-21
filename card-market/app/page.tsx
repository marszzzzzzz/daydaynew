'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import useSWR from 'swr';
import { CardPhoto } from '@/components/CardPhoto';
import { ArtFrame, ArtScan, ArtStack } from '@/components/guide/Art';
import { ScanHero, StarterChecklist } from '@/components/guide/Starter';
import { Tour, useTour } from '@/components/guide/Tour';
import { Blocked } from '@/components/RequireSignIn';
import { Badge, ButtonLink, Input, Loading, LoadError, Notice, PageTitle, Select } from '@/components/ui';
import { ApiError, fetcher } from '@/lib/api';
import { cardDetail, coverSide, searchHint } from '@/lib/cards';
import { useConfig, useDebounced, useMe } from '@/lib/hooks';
import { useT, type Key } from '@/lib/i18n';
import type { Listing, Me } from '@/lib/types';

export default function Home() {
  const { me, error, mutate, blocked } = useMe();
  if (blocked) return <Blocked error={blocked} />;
  if (error && me === undefined) return <LoadError error={error} retry={() => mutate()} />;
  if (me === undefined) return <Loading />;
  return me ? <><HomeStart me={me} /><Market /></> : <><ScanHero signedIn={false} /><Landing /></>;
}

/** Signed in: the camera button and starter checklist above the market, and a short first-visit tour. */
function HomeStart({ me }: { me: Me }) {
  const router = useRouter();
  const tour = useTour('home');
  return (
    <>
      <ScanHero signedIn />
      <StarterChecklist me={me} />
      <Tour id="home" open={tour.open} onClose={tour.close} finish={{ label: 'tour.home.go', action: () => router.push('/sell/batch') }}
        steps={[
          { target: 'scan-cta', title: 'tour.home.1.t', body: 'tour.home.1.d', art: <ArtFrame /> },
          { target: 'scan-cta', title: 'tour.home.2.t', body: 'tour.home.2.d', art: <ArtScan /> },
          { target: 'checklist', title: 'tour.home.3.t', body: 'tour.home.3.d', art: <ArtStack /> },
          { target: 'nav-sell', title: 'tour.home.4.t', body: 'tour.home.4.d' },
        ]} />
    </>
  );
}

function Landing() {
  const { t } = useT();
  const steps: [Key, Key, string][] = [['how.1.t', 'how.1.d', '📸'], ['how.2.t', 'how.2.d', '💬'], ['how.3.t', 'how.3.d', '🤝']];
  return (
    <div className="space-y-10 pb-4 sm:pb-10">
      <section className="relative overflow-hidden rounded-3xl bg-brand px-6 py-12 text-brand-ink sm:px-12 sm:py-16">
        <div aria-hidden className="pointer-events-none absolute -top-10 -right-6 hidden rotate-12 gap-3 opacity-90 sm:flex">
          {['#FFCB05', '#8B5CF6', '#FF4D2E'].map((c, i) => (
            <div key={c} className="h-44 w-32 rounded-xl border-4 border-white/70 shadow-xl" style={{ background: c, transform: `translateY(${i * 24}px) rotate(${i * 6}deg)` }} />
          ))}
        </div>
        <div className="relative max-w-xl">
          <h1 className="text-3xl leading-tight font-extrabold tracking-tight sm:text-5xl">{t('hero.title')}</h1>
          <p className="mt-4 text-base leading-relaxed opacity-90 sm:text-lg">{t('hero.sub')}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/signup" className="rounded-xl bg-accent px-5 py-3 font-semibold text-[#17192c] hover:opacity-90">{t('hero.start')}</Link>
            <Link href="/login" className="rounded-xl border border-white/40 px-5 py-3 font-semibold hover:bg-white/10">{t('hero.browse')}</Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {steps.map(([title, desc, icon], i) => (
          <div key={title} className="rounded-2xl border border-line bg-surface p-5">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-surface-2 text-xl" aria-hidden>{icon}</span>
              <span className="text-xs font-bold text-muted">0{i + 1}</span>
            </div>
            <h2 className="mt-4 text-lg font-bold">{t(title)}</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted">{t(desc)}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <Notice>🔒 {t('landing.safe')}</Notice>
        <Notice>🗂 {t('landing.shared')} <Link href="/login" className="font-semibold text-brand underline">{t('nav.signin')}</Link></Notice>
      </section>
    </div>
  );
}

type Sort = 'new' | 'price_asc' | 'price_desc';

function Market() {
  const { t, money } = useT();
  const config = useConfig();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState<Sort>('new');
  const query = useDebounced(q.trim(), 300);
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (category) params.set('category', category);
  if (sort !== 'new') params.set('sort', sort);
  const qs = params.toString(); // not params.size: missing before Safari 17
  const key = `real-market${qs ? `?${qs}` : ''}`;
  const { data, error, isLoading, mutate } = useSWR<Listing[] | null>(key, fetcher, { keepPreviousData: true, refreshInterval: 60_000 });
  const closed = error instanceof ApiError && error.code === 'MARKET_CLOSED';
  const categories = config?.categories.filter((c) => c.active) ?? [];

  return (
    <div>
      <PageTitle title={t('market.title')} sub={data ? t(data.length >= 200 ? 'market.countCap' : 'market.count', { n: data.length }) : undefined}
        action={<ButtonLink href="/sell/new" variant="secondary">＋ {t('sell.add')}</ButtonLink>} />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('market.search')} className="sm:max-w-sm" aria-label={t('market.search')} />
        <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="sm:w-56" aria-label={t('market.sortBy')}>
          {(['new', 'price_asc', 'price_desc'] as const).map((s) => <option key={s} value={s}>{t(`market.sort.${s}`)}</option>)}
        </Select>
      </div>

      {categories.length > 0 && (
        <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1">
          <Chip on={!category} onClick={() => setCategory('')}>{t('market.all')}</Chip>
          {categories.map((c) => (
            <Chip key={c.id} on={category === c.id} onClick={() => setCategory(c.id)} color={c.color}>{c.name}</Chip>
          ))}
        </div>
      )}

      {closed ? <Notice tone="warn">{t('market.closed')}</Notice>
        : error && !data ? <LoadError error={error} retry={() => mutate()} />
        : !data && isLoading ? <Loading />
        : data && data.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line px-6 py-14 text-center">
            <p className="text-muted">{t('market.empty')}</p>
            <ButtonLink href="/sell/new" className="mt-4">{t('market.empty.cta')}</ButtonLink>
          </div>
        ) : (
          <ul className={`grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 ${isLoading ? 'opacity-60' : ''}`}>
            {data?.map((l) => (
              <li key={l.id}>
                {/* ?q= lets the listing page find a card outside the newest 200 */}
                <Link href={`/listing/${encodeURIComponent(l.id)}?q=${encodeURIComponent(searchHint(l.name))}`} className="group block rounded-2xl border border-line bg-surface p-2.5 transition hover:-translate-y-0.5 hover:shadow-lg">
                  <div className="relative">
                    <CardPhoto cardId={l.id} side={coverSide(l.photos)} has={l.photos.length > 0} category={l.category} name={l.name} />
                    <div className="absolute top-2 left-2 flex flex-col items-start gap-1">
                      {l.mine && <Badge tone="brand">{t('listing.mine')}</Badge>}
                      {l.myOffer && <Badge tone="ok">{t('listing.offered')}</Badge>}
                    </div>
                  </div>
                  <div className="px-1 pt-2.5 pb-1">
                    <p className="truncate font-semibold">{l.name}</p>
                    <p className="truncate text-xs text-muted">{cardDetail(l) || l.category?.name || ' '}</p>
                    <div className="mt-2 flex items-end justify-between gap-2">
                      <span className="text-lg font-bold">{money(l.askingPrice, l.currency)}</span>
                      <span className="text-xs text-muted">{t('listing.available', { n: l.available })}</span>
                    </div>
                    <p className="mt-1 truncate text-xs text-muted">{t(`cond.${l.condition}`)} · {l.seller.name}{l.seller.region ? ` · ${l.seller.region}` : ''}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}

function Chip({ on, onClick, color, children }: { on: boolean; onClick: () => void; color?: string; children: ReactNode }) {
  return (
    <button onClick={onClick} aria-pressed={on}
      className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${on ? 'border-ink bg-ink text-bg' : 'border-line bg-surface hover:bg-surface-2'}`}>
      {color && <span aria-hidden className="size-2.5 rounded-full" style={{ background: color }} />}
      {children}
    </button>
  );
}
