'use client';
// Drafts box and sent log (spec §8.2).
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import useSWR from 'swr';
import { RequireSignIn } from '@/components/RequireSignIn';
import { Badge, ButtonLink, LoadError, Loading, PageTitle } from '@/components/ui';
import { api, fetcher } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { formatPhone } from '@/lib/phone';
import type { Message } from '@/lib/types';

function Messages() {
  const { t, ago, errorText } = useT();
  const router = useRouter();
  const [tab, setTab] = useState<'drafts' | 'sent'>('drafts');
  const [channel, setChannel] = useState<'' | 'WHATSAPP' | 'EMAIL'>('');
  const { data, error, mutate } = useSWR<{ messages: Message[] } | null>(`messages?status=${tab}${channel ? `&channel=${channel}` : ''}`, fetcher);
  const [err, setErr] = useState<string | null>(null);

  async function copy(m: Message) {
    try { const n = await api<Message>(`messages/${m.id}/copy`, { method: 'POST' }); router.push(`/messages/${n.id}`); } catch (e) { setErr(errorText(e)); }
  }
  async function remove(m: Message) {
    try { await api(`messages/${m.id}`, { method: 'DELETE' }); await mutate(); } catch (e) { setErr(errorText(e)); }
  }

  return (
    <div>
      <PageTitle title={t('msg.title')} action={<div className="flex gap-2"><ButtonLink href="/templates" variant="secondary">{t('tpl.title')}</ButtonLink><ButtonLink href="/messages/new">+ {t('msg.new')}</ButtonLink></div>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(['drafts', 'sent'] as const).map((x) => (
          <button key={x} type="button" onClick={() => setTab(x)} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${tab === x ? 'bg-brand text-brand-ink' : 'bg-surface-2 text-muted'}`}>{t(`msg.tab.${x}`)}</button>
        ))}
        <span className="mx-1 h-5 w-px bg-line" />
        {(['', 'WHATSAPP', 'EMAIL'] as const).map((x) => (
          <button key={x || 'all'} type="button" onClick={() => setChannel(x)} className={`rounded-full px-3 py-1 text-sm ${channel === x ? 'bg-surface text-ink ring-1 ring-line' : 'text-muted'}`}>{x ? (x === 'WHATSAPP' ? '💬 WhatsApp' : '✉️ Email') : t('msg.all')}</button>
        ))}
      </div>
      {err && <p className="mb-3 text-sm text-danger">{err}</p>}
      {error ? <LoadError error={error} retry={() => mutate()} /> : !data ? <Loading /> : !data.messages.length ? (
        <div className="rounded-2xl border border-dashed border-line px-6 py-12 text-center text-muted">{tab === 'drafts' ? t('msg.noDrafts') : t('msg.noSent')}</div>
      ) : (
        <ul className="grid gap-2">
          {data.messages.map((m) => (
            <li key={m.id} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
              <span className="text-xl">{m.channel === 'WHATSAPP' ? '💬' : '✉️'}</span>
              <Link href={`/messages/${m.id}`} className="min-w-0 flex-1">
                <p className="truncate font-semibold">{m.contactName || (m.toAddress ? (m.channel === 'WHATSAPP' ? formatPhone(m.toAddress) : m.toAddress) : t('msg.noRecipient'))}</p>
                <p className="truncate text-sm text-muted">{m.subject ? `${m.subject} — ` : ''}{m.body.replace(/\s+/g, ' ').slice(0, 120) || '—'}</p>
              </Link>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <Badge tone={m.status === 'SENT' ? 'ok' : m.status === 'FAILED' ? 'danger' : m.status === 'OPENED' ? 'brand' : 'neutral'}>{t(`status.${m.status}`)}</Badge>
                <span className="text-xs text-muted">{ago(m.sentAt ?? m.updatedAt)}</span>
              </div>
              <div className="flex shrink-0 flex-col gap-1 text-xs">
                <button type="button" onClick={() => copy(m)} className="text-brand underline">{t('msg.copy')}</button>
                {m.status !== 'SENT' && <button type="button" onClick={() => remove(m)} className="text-danger underline">{t('common.delete')}</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Page() {
  return <RequireSignIn><Messages /></RequireSignIn>;
}
