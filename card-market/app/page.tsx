'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Camera, Handshake, Layers, Lock, MessageCircle, Plus, type LucideIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import useSWR, { preload } from 'swr';
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
  // While the account is still loading, ask for the market too instead of after it (same key and fetcher as
  // <Market/>, which picks the answer up). Only then: later renders would start requests nobody reads.
  if (typeof window !== 'undefined' && me === undefined) preload('real-market', fetcher);
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
      <ScanHero signedIn compact={me.facts.realCards > 0} />
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
  const steps: [Key, Key, LucideIcon][] = [['how.1.t', 'how.1.d', Camera], ['how.2.t', 'how.2.d', MessageCircle], ['how.3.t', 'how.3.d', Handshake]];
  return (
    <div className="space-y-12 pb-4 sm:pb-10">
      <section className="grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-3">
        {steps.map(([title, desc, Icon], i) => (
          <div key={title} className="bg-bg p-6">
            <div className="flex items-center justify-between text-muted">
              <Icon aria-hidden size={22} strokeWidth={1.5} />
              <span className="display text-sm">0{i + 1}</span>
            </div>
            <h2 className="display mt-6 text-lg">{t(title)}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">{t(desc)}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 text-sm text-muted sm:grid-cols-2">
        <p className="flex gap-3"><Lock aria-hidden size={18} strokeWidth={1.5} className="mt-0.5 shrink-0 text-ink" />{t('landing.safe')}</p>
        <p className="flex gap-3"><Layers aria-hidden size={18} strokeWidth={1.5} className="mt-0.5 shrink-0 text-ink" /><span>{t('landing.shared')} <Link href="/login" className="text-ink underline underline-offset-4">{t('nav.signin')}</Link></span></p>
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
        action={<ButtonLink href="/sell/new" variant="secondary"><Plus aria-hidden size={16} strokeWidth={1.75} />{t('sell.add')}</ButtonLink>} />

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
          <div className="shelf px-6 pt-14 pb-16 text-center">
            <p className="text-muted">{t('market.empty')}</p>
            <ButtonLink href="/sell/new" className="mt-4">{t('market.empty.cta')}</ButtonLink>
          </div>
        ) : (
          // Each card stands on its own piece of shelf; with no gap between columns the pieces join into one
          // lit ledge per row, like the display case. The label hangs under the shelf.
          <ul className={`grid grid-cols-2 gap-y-10 sm:grid-cols-3 lg:grid-cols-4 ${isLoading ? 'opacity-60' : ''}`}>
            {data?.map((l, i) => (
              <li key={l.id} className="shelve" style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}>
                {/* ?q= lets the listing page find a card outside the newest 200 */}
                <Link href={`/listing/${encodeURIComponent(l.id)}?q=${encodeURIComponent(searchHint(l.name))}`} className="group block">
                  <div className="shelf px-3 pt-2 sm:px-5">
                    <div className="lamp relative rounded-sm transition group-hover:-translate-y-1">
                      <CardPhoto cardId={l.id} side={coverSide(l.photos)} has={l.photos.length > 0} category={l.category} name={l.name} thumb={480} />
                      {/* Bottom of the photo: the top is where a card prints its name. */}
                      <div className="absolute bottom-2 left-2 flex flex-wrap items-start gap-1">
                        {l.mine && <span className="rounded-full bg-black/80 px-2 py-0.5 text-xs text-white">{t('listing.mine')}</span>}
                        {l.myOffer && <span className="rounded-full bg-black/80 px-2 py-0.5 text-xs text-ok">{t('listing.offered')}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="px-3 pt-3 sm:px-5">
                    <p className="text-[15px] font-medium leading-tight text-accent">{money(l.askingPrice, l.currency)}</p>
                    <p className="mt-1 truncate text-sm">{l.name}</p>
                    <p className="truncate text-xs text-muted">{cardDetail(l) || l.category?.name || ' '}</p>
                    <p className="mt-1 truncate text-xs text-muted">{t(`cond.${l.condition}`)} · {t('listing.available', { n: l.available })}</p>
                    <p className="truncate text-xs text-muted">{l.seller.name}{l.seller.region ? ` · ${l.seller.region}` : ''}</p>
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
      className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${on ? 'border-shelf bg-shelf text-bg' : 'border-line text-muted hover:text-ink'}`}>
      {color && <span aria-hidden className="size-2.5 rounded-full" style={{ background: color }} />}
      {children}
    </button>
  );
}
