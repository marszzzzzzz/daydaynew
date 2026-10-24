'use client';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import useSWR from 'swr';
import { CardPhoto } from '@/components/CardPhoto';
import { RequireSignIn } from '@/components/RequireSignIn';
import { ShareButton } from '@/components/share/ShareSheet';
import { TagList } from '@/components/TagList';
import { Badge, ButtonLink, Loading, LoadError, Notice, PageTitle, Panel } from '@/components/ui';
import { ApiError, api, fetcher } from '@/lib/api';
import { cardDetail, coverSide, photoUrl, listingState, sellerReady, type ListingState } from '@/lib/cards';
import { isDone, useBatch } from '@/lib/batch';
import { useT } from '@/lib/i18n';
import { splitNotes } from '@/lib/meta';
import type { Me, RealCard } from '@/lib/types';

export default function SellPage() {
  return <RequireSignIn>{(me) => <MyCards me={me} />}</RequireSignIn>;
}

/** Errors fixed on the Account page. */
const ACCOUNT_CODES = new Set(['NEEDS_WHATSAPP', 'ACCOUNT_NOT_SECURED']);

const STATE_TONE: Record<ListingState, 'ok' | 'neutral' | 'warn' | 'danger'> = {
  live: 'ok', hidden: 'neutral', removed: 'danger', needsPrice: 'warn', needsQty: 'warn', needsAccount: 'warn',
};

function MyCards({ me }: { me: Me }) {
  const { t, money } = useT();
  const { data, error, mutate } = useSWR<RealCard[] | null>('real-cards', fetcher);
  const waiting = useBatch().filter((c) => !isDone(c)).length;
  const live = data?.filter((c) => listingState(c, me) === 'live') ?? [];
  const value = live.reduce((s, c) => s + (c.askingPrice ?? 0) * c.listedQuantity, 0);

  return (
    <div>
      <PageTitle title={t('sell.title')} sub={t('sell.sub')} action={
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/sell/batch" variant="secondary">📷 {t('batch.cta')}</ButtonLink>
          <ButtonLink href="/sell/new">＋ {t('sell.add')}</ButtonLink>
        </div>
      } />
      {waiting > 0 && (
        <Notice tone="warn" className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <span>{t('batch.resume', { n: waiting })}</span>
          <ButtonLink href="/sell/batch?step=review">{t('batch.resumeCta')}</ButtonLink>
        </Notice>
      )}

      {!sellerReady(me) && (
        <Panel className="mb-5">
          <h2 className="font-bold">{t('sell.ready.title')}</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <Check done={me.user.hasPassword}>{t('sell.ready.password')}</Check>
            <Check done={!!me.user.whatsapp}>{t('sell.ready.whatsapp')}</Check>
          </ul>
          <ButtonLink href="/account" variant="secondary" className="mt-4">{t('sell.ready.fix')}</ButtonLink>
        </Panel>
      )}

      {data && data.length > 0 && (
        <div className="mb-5 grid grid-cols-3 gap-3">
          <Stat label={t('sell.stats.cards')} value={String(data.length)} />
          <Stat label={t('sell.stats.live')} value={String(live.length)} />
          <Stat label={t('sell.stats.value')} value={money(value, data[0]?.currency)} />
        </div>
      )}

      {error && !data ? <LoadError error={error} retry={() => mutate()} />
        : !data ? <Loading />
        : data.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line px-6 py-14 text-center">
            <p className="text-muted">{t('sell.empty')}</p>
            <ButtonLink href="/sell/new" className="mt-4">＋ {t('sell.add')}</ButtonLink>
          </div>
        ) : (
          <ul className="space-y-3">
            {data.map((c) => <CardRow key={c.id} card={c} me={me} onChange={() => mutate()} />)}
          </ul>
        )}
    </div>
  );
}

function CardRow({ card: c, me, onChange }: { card: RealCard; me: Me; onChange: () => void }) {
  const { t, money, errorText } = useT();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const state = listingState(c, me);
  const cover = c.photos.find((p) => p.side === coverSide(c.photos.map((x) => x.side)));

  async function toggle() {
    setBusy(true);
    setErr(null);
    try {
      await api(`real-cards/${encodeURIComponent(c.id)}/market`, { body: { public: !c.marketPublic } });
      onChange();
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  }

  const meta = splitNotes(c.notes);
  return (
    <li className="rounded-2xl border border-line bg-surface p-3">
      <div className="flex gap-3">
        <Link href={`/sell/${encodeURIComponent(c.id)}`} className="w-16 shrink-0 sm:w-20">
          <CardPhoto cardId={c.id} side={cover?.side} has={!!cover} version={cover?.uploadedAt} category={c.category} name={c.name} className="rounded-lg" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <Link href={`/sell/${encodeURIComponent(c.id)}`} className="min-w-0">
              <p className="truncate font-semibold hover:underline">{c.name}</p>
              <p className="truncate text-xs text-muted">{cardDetail(c) || c.category?.name || t(`cond.${c.condition}`)}</p>
            </Link>
            <Badge tone={STATE_TONE[state]}>{t(`status.${state}`)}</Badge>
          </div>
          <TagList tags={meta.tags} serial={meta.serial} t={t} className="mt-1" />
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="font-bold">{c.askingPrice === null ? <span className="font-normal text-muted">{t('card.noPrice')}</span> : money(c.askingPrice, c.currency)}</span>
            <span className="text-muted">{t('card.owned', { n: c.quantity })}</span>
            <span className="text-muted">{t('card.forSale', { n: c.listedQuantity })}</span>
            {c.costPrice !== null && <span className="text-muted">{t('card.cost', { price: money(c.costPrice, c.currency) })}</span>}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <label className={`flex items-center gap-2 text-sm ${c.marketRemovedByAdmin ? 'opacity-50' : ''}`}>
              <input type="checkbox" role="switch" className="size-4 accent-[var(--brand)]" checked={c.marketPublic} disabled={busy || c.marketRemovedByAdmin} onChange={toggle} />
              {t('sell.toggle')}
            </label>
            <span className="flex items-center gap-1">
              <ShareButton compact card={{
                id: c.id, name: c.name, detail: cardDetail(c), price: c.askingPrice, currency: c.currency,
                tags: meta.tags, serial: meta.serial, listed: c.marketPublic,
                photo: cover ? photoUrl(c.id, cover.side, cover.uploadedAt) : null,
              }} />
              <Link href={`/sell/${encodeURIComponent(c.id)}`} className="text-sm font-medium text-brand">{t('listing.edit')}</Link>
            </span>
          </div>
        </div>
      </div>
      {err !== null && (
        <Notice tone="danger" className="mt-3">
          {errorText(err)}
          {err instanceof ApiError && ACCOUNT_CODES.has(err.code ?? '') && <> · <Link href="/account" className="underline">{t('sell.ready.fix')}</Link></>}
        </Notice>
      )}
    </li>
  );
}

const Check = ({ done, children }: { done: boolean; children: ReactNode }) => (
  <li className="flex items-center gap-2">
    <span aria-hidden className={`grid size-5 place-items-center rounded-full text-xs ${done ? 'bg-ok text-white' : 'border border-line'}`}>{done ? '✓' : ''}</span>
    <span className={done ? 'text-muted line-through' : ''}>{children}</span>
  </li>
);

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-2xl border border-line bg-surface px-3 py-3 sm:px-4">
    <p className="text-xs text-muted">{label}</p>
    <p className="mt-0.5 truncate text-lg font-bold sm:text-xl">{value}</p>
  </div>
);
