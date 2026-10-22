'use client';
// Admin area: sign in with your normal account; accounts listed in CARD_MARKET_ADMINS get the market
// and account moderation tools (remove / restore listings, read and stop deals, suspend or unlock players).
import { useState } from 'react';
import useSWR from 'swr';
import { RequireSignIn } from '@/components/RequireSignIn';
import { Badge, Button, ConfirmDialog, Input, Loading, LoadError, Notice, PageTitle, Panel, Select } from '@/components/ui';
import { api, fetcher } from '@/lib/api';
import { useDebounced, type AdminSession } from '@/lib/hooks';
import { useT, type Key } from '@/lib/i18n';

export default function AdminPage() {
  return <RequireSignIn>{() => <Gate />}</RequireSignIn>;
}

function Gate() {
  const { t } = useT();
  const { data: s, error, mutate } = useSWR<AdminSession | null>('admin/session', fetcher);
  if (error) return <LoadError error={error} retry={() => mutate()} />;
  if (!s) return <Loading />;
  if (!s.admin) {
    return (
      <Panel className="mx-auto max-w-lg space-y-3">
        <h1 className="text-xl font-bold">🔒 {t('admin.denied.title')}</h1>
        <p className="text-sm text-muted">{t('admin.denied.body', { name: s.name ?? '' })}</p>
        <div className="rounded-xl bg-surface-2 p-3 text-sm">
          <p className="text-xs text-muted">{t('admin.denied.id')}</p>
          <code className="mt-1 block font-mono break-all select-all">id:{s.id}</code>
        </div>
      </Panel>
    );
  }
  if (!s.configured) return <Notice tone="warn">{t('admin.notConfigured')}</Notice>;
  return <Admin name={s.name ?? ''} />;
}

type Tab = 'listings' | 'deals' | 'players';

function Admin({ name }: { name: string }) {
  const { t } = useT();
  const [tab, setTab] = useState<Tab>('listings');
  return (
    <div>
      <PageTitle title={`🛡️ ${t('admin.title')}`} sub={t('admin.signedInAs', { name })} />
      <div role="tablist" className="mb-5 flex gap-1 rounded-2xl bg-surface-2 p-1">
        {(['listings', 'deals', 'players'] as Tab[]).map((x) => (
          <button key={x} type="button" role="tab" aria-selected={tab === x} onClick={() => setTab(x)}
            className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold ${tab === x ? 'bg-surface shadow-sm' : 'text-muted'}`}>{t(`admin.tab.${x}`)}</button>
        ))}
      </div>
      {tab === 'listings' ? <Listings /> : tab === 'deals' ? <Deals /> : <Players />}
    </div>
  );
}

// ---------- market ----------
interface MarketData {
  totals: { listings: number; removed: number; open_offers: number; accepted: number; completed: number; completed_value: number };
  listings: {
    id: string; name: string; set_name: string; number: string; grade: string; asking_price: number | null; currency: string;
    listed_quantity: number; market_public: number; market_removed_by_admin: number; market_listed_at: number | null;
    seller_id: string; seller_name: string; seller_suspended: number; photo_sides: string | null; live_offers: number;
  }[];
  deals: {
    id: string; card_name: string; price: number; quantity: number; currency: string; status: string; updated_at: number;
    seller: string; buyer: string; messages: number;
  }[];
}

function useMarket(params: Record<string, string>) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
  return useSWR<MarketData | null>(`admin/real-market${qs ? `?${qs}` : ''}`, fetcher, { keepPreviousData: true });
}

function Totals({ totals }: { totals: MarketData['totals'] }) {
  const { t, money } = useT();
  const items: [Key, string | number][] = [
    ['admin.t.listings', totals.listings], ['admin.t.removed', totals.removed], ['admin.t.open', totals.open_offers],
    ['admin.t.accepted', totals.accepted], ['admin.t.completed', totals.completed], ['admin.t.value', money(Number(totals.completed_value))],
  ];
  return (
    <div className="mb-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
      {items.map(([k, v]) => (
        <div key={k} className="rounded-2xl border border-line bg-surface p-3">
          <p className="text-xs text-muted">{t(k)}</p>
          <p className="truncate text-lg font-bold">{v}</p>
        </div>
      ))}
    </div>
  );
}

function Listings() {
  const { t, money, ago, errorText } = useT();
  const [q, setQ] = useState('');
  const [show, setShow] = useState<'' | 'removed' | 'all'>('');
  const query = useDebounced(q.trim(), 300);
  const { data, error, mutate } = useMarket({ q: query, listings: show });
  const [act, setAct] = useState<{ id: string; name: string; restore: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    if (!act) return;
    setBusy(true); setErr(null);
    try { await api(`admin/real-market/${encodeURIComponent(act.id)}/${act.restore ? 'restore' : 'remove'}`, { body: {} }); await mutate(); setAct(null); }
    catch (e) { setErr(errorText(e)); }
    setBusy(false);
  }

  return (
    <div>
      {data && <Totals totals={data.totals} />}
      <div className="mb-3 flex flex-col gap-2 sm:flex-row">
        <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('admin.searchListings')} aria-label={t('admin.searchListings')} />
        <Select value={show} onChange={(e) => setShow(e.target.value as typeof show)} className="sm:w-48" aria-label={t('admin.show')}>
          <option value="">{t('admin.show.live')}</option><option value="removed">{t('admin.show.removed')}</option><option value="all">{t('admin.show.all')}</option>
        </Select>
      </div>
      {err && <Notice tone="danger" className="mb-3">{err}</Notice>}
      {error && !data ? <LoadError error={error} retry={() => mutate()} /> : !data ? <Loading /> : data.listings.length === 0 ? <Notice>{t('admin.none')}</Notice> : (
        <ul className="space-y-2">
          {data.listings.map((l) => {
            const removed = !!l.market_removed_by_admin;
            const front = String(l.photo_sides ?? '').includes('FRONT');
            return (
              <li key={l.id} className="flex gap-3 rounded-2xl border border-line bg-surface p-3">
                <div className="h-20 w-14 shrink-0 overflow-hidden rounded-lg bg-surface-2">
                  {front && <img src={`/api/admin/real-cards/${encodeURIComponent(l.id)}/photos/front`} alt="" loading="lazy" className="size-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate font-semibold">{l.name}</p>
                    {removed ? <Badge tone="danger">{t('admin.removed')}</Badge> : l.market_public ? <Badge tone="ok">{t('admin.live')}</Badge> : <Badge>{t('admin.hidden')}</Badge>}
                  </div>
                  <p className="truncate text-xs text-muted">{[l.set_name, l.number, l.grade].filter(Boolean).join(' · ')}</p>
                  <p className="mt-1 text-sm">
                    <b>{l.asking_price === null ? '—' : money(l.asking_price, l.currency)}</b>
                    <span className="text-muted"> · {t('listing.available', { n: l.listed_quantity })} · {t('admin.liveOffers', { n: l.live_offers })}</span>
                  </p>
                  <p className="text-xs text-muted">
                    {t('listing.seller')}: {l.seller_name}{l.seller_suspended ? ` (${t('admin.suspended')})` : ''}
                    {l.market_listed_at ? ` · ${ago(l.market_listed_at)}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-start">
                  <Button variant={removed ? 'secondary' : 'danger'} onClick={() => setAct({ id: l.id, name: l.name, restore: removed })}>
                    {t(removed ? 'admin.restore' : 'admin.remove')}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <ConfirmDialog open={!!act} danger={!act?.restore} busy={busy} onClose={() => setAct(null)} onConfirm={run}
        message={act ? t(act.restore ? 'admin.restore.confirm' : 'admin.remove.confirm', { name: act.name }) : ''}
        confirmLabel={act ? t(act.restore ? 'admin.restore' : 'admin.remove') : undefined} />
    </div>
  );
}

// ---------- deals ----------
const STATUSES = ['', 'OPEN', 'ACCEPTED', 'COMPLETED', 'DECLINED', 'WITHDRAWN', 'CANCELLED'] as const;

interface DealDetail {
  id: string; status: string; card: { name: string; detail: string }; price: number; quantity: number; currency: string;
  seller: { name: string }; buyer: { name: string };
  messages: { id: string; kind: 'TEXT' | 'EVENT'; body: string; createdAt: number; from: string; sender: string | null }[];
}

function Deals() {
  const { t, money, ago } = useT();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<(typeof STATUSES)[number]>('');
  const query = useDebounced(q.trim(), 300);
  const { data, error, mutate } = useMarket({ q: query, status });
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row">
        <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('admin.searchDeals')} aria-label={t('admin.searchDeals')} />
        <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="sm:w-48" aria-label={t('admin.status')}>
          {STATUSES.map((s) => <option key={s} value={s}>{s ? t(`dstatus.${s}` as Key) : t('admin.allStatuses')}</option>)}
        </Select>
      </div>
      {error && !data ? <LoadError error={error} retry={() => mutate()} /> : !data ? <Loading /> : data.deals.length === 0 ? <Notice>{t('admin.none')}</Notice> : (
        <ul className="space-y-2">
          {data.deals.map((d) => (
            <li key={d.id}>
              <button type="button" onClick={() => setOpen(d.id)} className="flex w-full items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-3 text-left hover:border-brand">
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{d.card_name}</span>
                  <span className="block text-xs text-muted">{d.seller} → {d.buyer} · {money(d.price, d.currency)} × {d.quantity} · 💬 {d.messages} · {ago(d.updated_at)}</span>
                </span>
                <Badge tone={d.status === 'OPEN' || d.status === 'ACCEPTED' ? 'warn' : d.status === 'COMPLETED' ? 'ok' : 'neutral'}>{t(`dstatus.${d.status}` as Key)}</Badge>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && <DealDialog id={open} onClose={() => setOpen(null)} onChanged={() => mutate()} />}
    </div>
  );
}

function DealDialog({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { t, money, ago, errorText } = useT();
  const { data, error, mutate } = useSWR<DealDetail | null>(`admin/real-market/deals/${encodeURIComponent(id)}`, fetcher);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const live = data && (data.status === 'OPEN' || data.status === 'ACCEPTED');

  async function cancel() {
    setBusy(true); setErr(null);
    try { await api(`admin/real-market/deals/${encodeURIComponent(id)}/cancel`, { body: { note } }); await mutate(); onChanged(); setNote(''); }
    catch (e) { setErr(errorText(e)); }
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-modal="true" className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-surface p-5 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        {error ? <LoadError error={error} retry={() => mutate()} /> : !data ? <Loading /> : (
          <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">{data.card.name}</h2>
                <p className="text-xs text-muted">{data.card.detail}</p>
                <p className="mt-1 text-sm">{data.seller.name} → {data.buyer.name} · <b>{money(data.price, data.currency)}</b> × {data.quantity}</p>
              </div>
              <Badge>{t(`dstatus.${data.status}` as Key)}</Badge>
            </div>
            <ol className="mt-4 space-y-2">
              {data.messages.map((m) => (
                <li key={m.id} className={`rounded-xl px-3 py-2 text-sm ${m.kind === 'EVENT' ? 'bg-surface-2 text-center text-xs text-muted' : m.from === 'admin' ? 'bg-warn-soft' : 'bg-surface-2'}`}>
                  {m.kind === 'TEXT' && <span className="block text-xs font-semibold text-muted">{m.sender ?? m.from}</span>}
                  <span className="whitespace-pre-wrap">{m.body}</span>
                  <span className="mt-0.5 block text-[11px] text-muted">{ago(m.createdAt)}</span>
                </li>
              ))}
            </ol>
            {live && (
              <div className="mt-4 space-y-2 rounded-2xl border border-danger/40 p-3">
                <p className="text-sm font-semibold">{t('admin.cancelDeal')}</p>
                <Input value={note} maxLength={400} onChange={(e) => setNote(e.target.value)} placeholder={t('admin.cancelNote')} aria-label={t('admin.cancelNote')} />
                {err && <Notice tone="danger">{err}</Notice>}
                <Button variant="danger" busy={busy} disabled={!note.trim()} onClick={cancel}>{t('admin.cancelDeal')}</Button>
              </div>
            )}
            <Button variant="ghost" className="mt-3 w-full" onClick={onClose}>{t('admin.close')}</Button>
          </>
        )}
      </div>
    </div>
  );
}

// ---------- players ----------
interface Player {
  id: string; display_name: string; region: string | null; account_type: 'PLAYER' | 'COLLECTOR'; hidden: number; suspended: number;
  suspended_reason: string | null; created_at: number; has_password: boolean; locked: boolean; real_cards: number; last_active: number | null;
}
type PlayerAction = 'suspend' | 'unsuspend' | 'sign-out' | 'unlock';

function Players() {
  const { t, ago, errorText } = useT();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const query = useDebounced(q.trim(), 300);
  const qs = new URLSearchParams(Object.entries({ q: query, status }).filter(([, v]) => v)).toString();
  const { data, error, mutate } = useSWR<Player[] | null>(`admin/players${qs ? `?${qs}` : ''}`, fetcher, { keepPreviousData: true });
  const [act, setAct] = useState<{ p: Player; action: PlayerAction } | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    if (!act) return;
    setBusy(true); setErr(null);
    try {
      await api(`admin/players/${encodeURIComponent(act.p.id)}/${act.action}`, { body: act.action === 'suspend' ? { reason } : {} });
      await mutate(); setAct(null); setReason('');
    } catch (e) { setErr(errorText(e)); }
    setBusy(false);
  }

  return (
    <div>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row">
        <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('admin.searchPlayers')} aria-label={t('admin.searchPlayers')} />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="sm:w-48" aria-label={t('admin.status')}>
          <option value="">{t('admin.allAccounts')}</option>
          {(['active', 'suspended', 'locked', 'no_password'] as const).map((s) => <option key={s} value={s}>{t(`admin.p.${s}`)}</option>)}
        </Select>
      </div>
      {err && <Notice tone="danger" className="mb-3">{err}</Notice>}
      {error && !data ? <LoadError error={error} retry={() => mutate()} /> : !data ? <Loading /> : data.length === 0 ? <Notice>{t('admin.none')}</Notice> : (
        <ul className="space-y-2">
          {data.map((p) => (
            <li key={p.id} className="rounded-2xl border border-line bg-surface p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold">{p.display_name} <span className="text-xs font-normal text-muted">{p.account_type === 'COLLECTOR' ? t('admin.collector') : t('admin.player')}</span></p>
                  <p className="text-xs text-muted">
                    {t('admin.realCards', { n: p.real_cards })} · {t('admin.joined', { when: ago(p.created_at) })}
                    {p.last_active ? ` · ${t('admin.active', { when: ago(p.last_active) })}` : ''}
                  </p>
                  {p.suspended ? <p className="mt-1 text-xs text-danger">{t('admin.suspended')}{p.suspended_reason ? `：${p.suspended_reason}` : ''}</p> : null}
                </div>
                <div className="flex flex-wrap gap-1">
                  {p.suspended ? <Badge tone="danger">{t('admin.suspended')}</Badge> : null}
                  {p.locked ? <Badge tone="warn">{t('admin.p.locked')}</Badge> : null}
                  {!p.has_password ? <Badge>{t('admin.p.no_password')}</Badge> : null}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {p.suspended
                  ? <Button variant="secondary" onClick={() => setAct({ p, action: 'unsuspend' })}>{t('admin.a.unsuspend')}</Button>
                  : <Button variant="danger" onClick={() => setAct({ p, action: 'suspend' })}>{t('admin.a.suspend')}</Button>}
                {p.locked && <Button variant="secondary" onClick={() => setAct({ p, action: 'unlock' })}>{t('admin.a.unlock')}</Button>}
                <Button variant="ghost" onClick={() => setAct({ p, action: 'sign-out' })}>{t('admin.a.sign-out')}</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog open={!!act} danger={act?.action === 'suspend'} busy={busy}
        onClose={() => { setAct(null); setReason(''); setErr(null); }} onConfirm={run}
        confirmLabel={act ? t(`admin.a.${act.action}`) : undefined}
        message={act ? (
          <span className="block space-y-3">
            <span className="block">{t(`admin.a.${act.action}.confirm`, { name: act.p.display_name })}</span>
            {act.action === 'suspend' && (
              <Input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder={t('admin.reason')} aria-label={t('admin.reason')} />
            )}
            {err && <span className="block text-sm text-danger">{err}</span>}
          </span>
        ) : ''} />
    </div>
  );
}
