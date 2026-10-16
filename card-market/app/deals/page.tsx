'use client';
import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import { CardPhoto } from '@/components/CardPhoto';
import { DealStatusBadge } from '@/components/DealBits';
import { RequireSignIn } from '@/components/RequireSignIn';
import { Loading, LoadError, PageTitle } from '@/components/ui';
import { fetcher } from '@/lib/api';
import { useT, type Key } from '@/lib/i18n';
import type { Deal } from '@/lib/types';

export default function DealsPage() {
  return <RequireSignIn>{() => <Deals />}</RequireSignIn>;
}

type Tab = 'received' | 'sent';

function Deals() {
  const { t } = useT();
  const { data, error, mutate } = useSWR<{ received: Deal[]; sent: Deal[] } | null>('real-market/deals', fetcher, { refreshInterval: 20_000 });
  const [picked, setPicked] = useState<Tab | null>(null);
  // Open on the side that needs attention.
  const tab: Tab = picked ?? (data && !data.received.some((d) => d.unread) && data.sent.some((d) => d.unread) ? 'sent' : 'received');
  const tabs: [Tab, Key][] = [['received', 'deals.received'], ['sent', 'deals.sent']];

  return (
    <div>
      <PageTitle title={t('deals.title')} />
      <div role="tablist" className="mb-4 inline-flex rounded-xl bg-surface-2 p-1">
        {tabs.map(([k, label]) => {
          const unread = data?.[k].filter((d) => d.unread > 0).length ?? 0;
          return (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setPicked(k)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold ${tab === k ? 'bg-surface shadow-sm' : 'text-muted'}`}>
              {t(label)} {data && <span className="text-xs text-muted">{data[k].length}</span>}
              {unread > 0 && <span className="size-2 rounded-full bg-danger" aria-label={`${unread} unread`} />}
            </button>
          );
        })}
      </div>

      {error && !data ? <LoadError error={error} retry={() => mutate()} />
        : !data ? <Loading />
        : data[tab].length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line px-6 py-12 text-center text-muted">{t(tab === 'received' ? 'deals.empty.received' : 'deals.empty.sent')}</p>
        ) : (
          <ul className="space-y-2">{data[tab].map((d) => <DealRow key={d.id} deal={d} />)}</ul>
        )}
    </div>
  );
}

function DealRow({ deal: d }: { deal: Deal }) {
  const { t, money, ago } = useT();
  const last = d.lastMessage;
  const preview = !last ? '' : last.kind === 'EVENT' ? t(`event.${last.body}` as Key) : `${last.mine ? `${t('deal.you')}: ` : ''}${last.body}`;
  return (
    <li>
      <Link href={`/deals/${encodeURIComponent(d.id)}`} className="flex gap-3 rounded-2xl border border-line bg-surface p-3 hover:bg-surface-2">
        <div className="w-12 shrink-0">
          <CardPhoto cardId={d.realCardId} has={d.card.photos.includes('FRONT')} name={d.card.name} className="rounded-lg" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className={`truncate ${d.unread ? 'font-bold' : 'font-semibold'}`}>{d.card.name}</p>
            <DealStatusBadge status={d.status} />
          </div>
          <p className="text-sm">
            <b>{money(d.price * d.quantity, d.currency)}</b>
            <span className="text-muted"> · {t('deal.each', { price: money(d.price, d.currency), qty: d.quantity })} · {t('deal.with', { name: d.counterpart.name })}</span>
          </p>
          <div className="mt-0.5 flex items-center justify-between gap-2 text-xs text-muted">
            <span className="truncate">{preview}</span>
            <span className="flex shrink-0 items-center gap-1.5">
              {d.unread > 0 && <span className="rounded-full bg-danger px-1.5 text-[10px] font-bold leading-4 text-white">{d.unread}</span>}
              {ago(d.updatedAt)}
            </span>
          </div>
        </div>
      </Link>
    </li>
  );
}
