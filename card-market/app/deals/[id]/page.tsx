'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { CardPhoto } from '@/components/CardPhoto';
import { DealStatusBadge, isLive } from '@/components/DealBits';
import { RequireSignIn } from '@/components/RequireSignIn';
import { Button, ConfirmDialog, Loading, LoadError, Notice, Panel, Textarea } from '@/components/ui';
import { ApiError, api, fetcher } from '@/lib/api';
import { formatWhatsApp, whatsAppLink } from '@/lib/cards';
import { useT, type Key } from '@/lib/i18n';
import type { Deal, DealAction } from '@/lib/types';

export default function DealPage() {
  return <RequireSignIn>{() => <DealView />}</RequireSignIn>;
}

const PRIMARY: DealAction[] = ['accept', 'complete'];

function DealView() {
  const { id } = useParams<{ id: string }>();
  const { t, money, ago, errorText } = useT();
  const { mutate: mutateKey } = useSWRConfig();
  const key = `real-market/deals/${encodeURIComponent(id)}`;
  // Opening a deal marks it read, so poll while it is on screen.
  const { data: deal, error, mutate } = useSWR<Deal | null>(key, fetcher, { refreshInterval: 10_000 });
  const [pending, setPending] = useState<DealAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [text, setText] = useState('');
  const list = useRef<HTMLOListElement>(null);
  const count = deal?.messages?.length ?? 0;

  // Keep the newest message in view (scroll the conversation, not the page).
  useEffect(() => { if (list.current) list.current.scrollTop = list.current.scrollHeight; }, [count]);
  // Fetching the deal marked it read: refresh the unread badges.
  const loaded = !!deal;
  useEffect(() => { if (loaded) { mutateKey('me'); mutateKey('real-market/deals'); } }, [loaded, count, mutateKey]);

  const back = <Link href="/deals" className="mb-4 inline-block text-sm text-muted hover:text-ink">← {t('deal.back')}</Link>;
  if (error && !deal) {
    return <div>{back}{error instanceof ApiError && error.status === 404 ? <Notice>{t('deal.notFound')}</Notice> : <LoadError error={error} retry={() => mutate()} />}</div>;
  }
  if (!deal) return <Loading />;

  async function act(action: DealAction) {
    setBusy(true);
    setErr(null);
    try {
      const next = await api<Deal>(`real-market/deals/${encodeURIComponent(id)}/${action}`, { method: 'POST' });
      await mutate(next, { revalidate: false });
      mutateKey('real-cards');
      mutateKey((k) => typeof k === 'string' && k.startsWith('real-market'));
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
      setPending(null);
    }
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const next = await api<Deal>(`real-market/deals/${encodeURIComponent(id)}/messages`, { body: { body: text } });
      setText('');
      await mutate(next, { revalidate: false });
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const d = deal;
  const price = money(d.price, d.currency);
  const next = isLive(d.status) ? t(`deal.next.${d.role}.${d.status}` as Key) : t('deal.next.closed');
  const wa = d.counterpart.whatsapp;
  const waText = t('deal.whatsapp.msg', { name: d.counterpart.name, card: d.card.name, qty: d.quantity, price });

  return (
    <div>
      {back}
      <div className="grid gap-5 lg:grid-cols-[22rem_1fr]">
        <div className="space-y-4 self-start">
          <Panel>
            <div className="flex gap-4">
              <div className="w-20 shrink-0">
                <CardPhoto cardId={d.realCardId} has={d.card.photos.includes('FRONT')} name={d.card.name} className="rounded-lg" />
              </div>
              <div className="min-w-0">
                <DealStatusBadge status={d.status} />
                <h1 className="mt-1.5 text-lg leading-snug font-bold">{d.card.name}</h1>
                {d.card.detail && <p className="text-xs text-muted">{d.card.detail}</p>}
                <p className="mt-2 text-sm text-muted">{t('deal.with', { name: d.counterpart.name })}{d.counterpart.region ? ` · ${d.counterpart.region}` : ''}</p>
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 text-sm">
              <div><dt className="text-xs text-muted">{t('deal.total')}</dt><dd className="text-xl font-bold">{money(d.price * d.quantity, d.currency)}</dd></div>
              <div><dt className="text-xs text-muted">&nbsp;</dt><dd className="pt-1">{t('deal.each', { price, qty: d.quantity })}</dd></div>
            </dl>
            <p className="mt-3 text-xs text-muted">{t('deal.started', { when: ago(d.createdAt) })}</p>
          </Panel>

          <Notice tone={d.status === 'ACCEPTED' ? 'ok' : 'neutral'}>{next}</Notice>

          {(d.status === 'ACCEPTED' || d.status === 'COMPLETED') && (
            <Panel>
              <p className="text-sm font-semibold">{t('deal.whatsapp', { name: d.counterpart.name })}</p>
              {wa ? (
                <>
                  <p className="mt-1 text-lg font-bold tracking-wide">{formatWhatsApp(wa)}</p>
                  <a href={whatsAppLink(wa, waText)} target="_blank" rel="noopener noreferrer"
                    className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-[#073b1d] hover:opacity-90">
                    {t('deal.whatsapp.open')}
                  </a>
                </>
              ) : <p className="mt-1 text-sm text-muted">{t('deal.whatsapp.none')}</p>}
            </Panel>
          )}

          {d.actions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {d.actions.map((a) => (
                <Button key={a} variant={PRIMARY.includes(a) ? 'primary' : 'danger'} onClick={() => setPending(a)} disabled={busy} className="flex-1">
                  {t(`action.${a}`)}
                </Button>
              ))}
            </div>
          )}
          {err && <Notice tone="danger">{err}</Notice>}
        </div>

        <Panel className="flex min-h-[24rem] flex-col">
          <h2 className="mb-3 font-bold">{t('deal.messages')}</h2>
          <ol ref={list} className="max-h-[60vh] flex-1 space-y-2 overflow-y-auto pr-1">
            {d.messages?.map((m) => m.kind === 'EVENT' ? (
              <li key={m.id} className="py-1 text-center text-xs text-muted">
                — {t(`event.${m.body}` as Key)}{m.fromAdmin ? ` (${t('deal.admin')})` : ''} · {ago(m.createdAt)} —
              </li>
            ) : (
              <li key={m.id} className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-[15px] whitespace-pre-wrap break-words ${m.mine ? 'rounded-br-md bg-brand text-brand-ink' : m.fromAdmin ? 'rounded-bl-md bg-warn-soft text-ink' : 'rounded-bl-md bg-surface-2'}`}>
                  {m.fromAdmin && <span className="mb-0.5 block text-xs font-bold text-warn">{t('deal.admin')}</span>}
                  {m.body}
                  <span className={`mt-0.5 block text-[11px] ${m.mine ? 'opacity-70' : 'text-muted'}`}>{ago(m.createdAt)}</span>
                </div>
              </li>
            ))}
          </ol>
          {isLive(d.status) ? (
            <form onSubmit={send} className="mt-3 flex items-end gap-2 border-t border-line pt-3">
              <Textarea value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} placeholder={t('deal.compose')} className="min-h-11 flex-1 resize-none" rows={1}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} />
              <Button type="submit" busy={busy} disabled={!text.trim()}>{t('deal.send')}</Button>
            </form>
          ) : <p className="mt-3 border-t border-line pt-3 text-center text-sm text-muted">{t('deal.closedNoMsg')}</p>}
        </Panel>
      </div>

      <ConfirmDialog open={pending !== null} busy={busy} danger={pending !== null && !PRIMARY.includes(pending)}
        message={pending ? t(`confirm.${pending}`) : ''} confirmLabel={pending ? t(`action.${pending}`) : undefined}
        onConfirm={() => pending && act(pending)} onClose={() => setPending(null)} />
    </div>
  );
}
