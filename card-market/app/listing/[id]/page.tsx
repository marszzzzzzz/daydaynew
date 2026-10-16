'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import useSWR from 'swr';
import { CardPhoto } from '@/components/CardPhoto';
import { RequireSignIn } from '@/components/RequireSignIn';
import { Badge, Button, ButtonLink, Field, Input, Loading, LoadError, Notice, Panel, Textarea } from '@/components/ui';
import { api, fetcher } from '@/lib/api';
import { useT } from '@/lib/i18n';
import type { Deal, Listing, Me, PhotoSide } from '@/lib/types';

export default function ListingPage() {
  return <RequireSignIn>{(me) => <ListingView me={me} />}</RequireSignIn>;
}

function ListingView({ me }: { me: Me }) {
  const { id } = useParams<{ id: string }>();
  const { t, money, ago } = useT();
  // There is no single-listing endpoint: the market list (≤ 200, newest first) is the source.
  const { data, error, mutate } = useSWR<Listing[] | null>('real-market', fetcher);
  const [side, setSide] = useState<PhotoSide>('FRONT');

  if (error && !data) return <LoadError error={error} retry={() => mutate()} />;
  if (!data) return <Loading />;
  const l = data.find((x) => x.id === id);
  const back = <Link href="/" className="mb-4 inline-block text-sm text-muted hover:text-ink">← {t('listing.back')}</Link>;
  if (!l) return <div>{back}<Notice>{t('listing.notFound')}</Notice></div>;

  const rows: [string, string][] = [
    [t('field.category'), l.category?.name ?? '—'],
    [t('field.set'), l.setName || '—'],
    [t('field.number'), l.number || '—'],
    [t('field.language'), t(`clang.${l.language}`)],
    [t('field.condition'), t(`cond.${l.condition}`)],
    [t('field.grade'), l.grade || '—'],
  ];

  return (
    <div>
      {back}
      <div className="grid gap-6 md:grid-cols-[minmax(0,22rem)_1fr] lg:gap-10">
        <div>
          <CardPhoto cardId={l.id} side={side} has={l.photos.includes(side)} category={l.category} name={l.name} className="shadow-xl" />
          {l.photos.length > 1 && (
            <div className="mt-3 flex justify-center gap-2">
              {(['FRONT', 'BACK'] as const).map((s) => (
                <button key={s} onClick={() => setSide(s)} aria-pressed={side === s}
                  className={`rounded-full px-3 py-1 text-sm ${side === s ? 'bg-ink text-bg' : 'bg-surface-2 text-muted'}`}>{t(`side.${s}`)}</button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              {l.category && <Badge>{l.category.name}</Badge>}
              <Badge tone="ok">{t('listing.available', { n: l.available })}</Badge>
            </div>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight">{l.name}</h1>
            <p className="mt-3 text-3xl font-bold">{money(l.askingPrice, l.currency)} <span className="text-base font-medium text-muted">{t('listing.each')}</span></p>
            <p className="mt-2 text-sm text-muted">
              {t('listing.seller')}: <b className="text-ink">{l.seller.name}</b>{l.seller.region ? ` · ${l.seller.region}` : ''}
              {l.listedAt ? ` · ${t('listing.listed')} ${ago(l.listedAt)}` : ''}
            </p>
          </div>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-2xl border border-line bg-surface p-4 sm:grid-cols-3">
            {rows.map(([k, v]) => (
              <div key={k}><dt className="text-xs text-muted">{k}</dt><dd className="font-medium">{v}</dd></div>
            ))}
          </dl>

          {l.mine ? (
            <Notice className="flex items-center justify-between gap-3">
              <span>{t('listing.yours')}</span>
              <ButtonLink href={`/sell/${encodeURIComponent(l.id)}`} variant="secondary">{t('listing.edit')}</ButtonLink>
            </Notice>
          ) : l.myOffer ? (
            <Notice tone="ok" className="flex items-center justify-between gap-3">
              <span>{t('offer.existing')}</span>
              <ButtonLink href={`/deals/${encodeURIComponent(l.myOffer.id)}`} variant="secondary">{t('offer.viewDeal')}</ButtonLink>
            </Notice>
          ) : !me.user.hasPassword ? (
            <Notice tone="warn" className="flex items-center justify-between gap-3">
              <span>{t('offer.needsPassword')}</span>
              <ButtonLink href="/account" variant="secondary">{t('sell.ready.fix')}</ButtonLink>
            </Notice>
          ) : (
            <OfferForm listing={l} onDone={() => mutate()} />
          )}
        </div>
      </div>
    </div>
  );
}

function OfferForm({ listing: l, onDone }: { listing: Listing; onDone: () => void }) {
  const { t, money, errorText } = useT();
  const router = useRouter();
  const [price, setPrice] = useState(String(l.askingPrice));
  const [qty, setQty] = useState(1);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const total = Number(price) * qty;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const deal = await api<Deal>(`real-market/${encodeURIComponent(l.id)}/offers`, { body: { price: Number(price), quantity: qty, message } });
      onDone();
      router.push(`/deals/${encodeURIComponent(deal.id)}`);
    } catch (e) {
      setErr(errorText(e));
      setBusy(false);
    }
  }

  return (
    <Panel>
      <form onSubmit={submit} className="space-y-4">
        <h2 className="text-lg font-bold">{t('offer.title')}</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('offer.price', { cur: l.currency })}>
            <Input type="number" inputMode="decimal" min="0.01" step="0.01" required value={price} onChange={(e) => setPrice(e.target.value)} />
          </Field>
          <Field label={t('offer.qty')}>
            <Input type="number" inputMode="numeric" min={1} max={l.available} step={1} required value={qty}
              onChange={(e) => setQty(Math.max(1, Math.min(l.available, Math.floor(Number(e.target.value) || 1))))} />
          </Field>
        </div>
        <Field label={t('offer.message')}>
          <Textarea maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t('offer.message.ph')} />
        </Field>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">{t('offer.total')}: <b className="text-lg">{Number.isFinite(total) && total > 0 ? money(total, l.currency) : '—'}</b></p>
          <Button type="submit" busy={busy}>{t('offer.submit')}</Button>
        </div>
        {err && <Notice tone="danger">{err}</Notice>}
        <p className="text-xs text-muted">{t('offer.note')}</p>
      </form>
    </Panel>
  );
}
