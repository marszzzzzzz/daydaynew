'use client';
// Contact detail (spec §6): card photos, every field with call / WhatsApp / copy / e-mail actions, send this
// contact's details, add to the phone's address book, message history, edit / archive / delete.
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { FlipPhoto } from '@/components/Photo';
import { RequireSignIn } from '@/components/RequireSignIn';
import { TagChip } from '@/components/Tags';
import { Badge, Button, ButtonLink, ConfirmDialog, LoadError, Loading, Notice, Panel } from '@/components/ui';
import { api, fetcher } from '@/lib/api';
import { cardDraft, createDraft } from '@/lib/draft';
import { todayHK, useMe } from '@/lib/hooks';
import { useT } from '@/lib/i18n';
import { formatPhone, waLink } from '@/lib/phone';
import type { Channel, Contact, Message } from '@/lib/types';

function Detail() {
  const { t, errorText, ago } = useT();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { me } = useMe();
  const { mutate } = useSWRConfig();
  const { data: c, error, mutate: reload } = useSWR<Contact | null>(`contacts/${id}`, fetcher);
  const { data: hist } = useSWR<{ messages: Message[] } | null>(`messages?contact=${id}`, fetcher);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [share, setShare] = useState(false);
  const [withLink, setWithLink] = useState(true);

  if (error) return <LoadError error={error} retry={() => reload()} />;
  if (c === undefined) return <Loading />;
  if (c === null) return <Notice tone="danger">{t('err.NOT_FOUND')}</Notice>;

  const refresh = () => Promise.all([reload(), mutate((k) => typeof k === 'string' && k.startsWith('contacts?')), mutate('me')]);

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key); setNote(null);
    try { await fn(); } catch (e) { setNote(errorText(e)); } finally { setBusy(null); }
  }
  const draft = (channel: Channel, toAddress?: string) => run(`d-${channel}-${toAddress}`, async () => {
    const m = await createDraft({ channel, contactId: c!.id, toAddress });
    router.push(`/messages/${m.id}`);
  });
  const sendDetails = (channel: Channel) => run(`s-${channel}`, async () => {
    const m = await cardDraft({ channel, of: c!, me: me!.user, withLink, linkLabel: t('share.linkLabel') });
    router.push(`/messages/${m.id}`);
  });
  const copy = async (v: string) => { try { await navigator.clipboard.writeText(v); setNote(t('common.copied')); } catch { /* ignore */ } };
  const due = c.followUpOn && c.followUpOn <= todayHK();

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{c.starred && '⭐ '}{c.nameZh || c.nameEn || c.company || c.companyEn || t('list.noName')}</h1>
          {c.nameZh && c.nameEn && <p className="text-lg text-muted">{c.nameEn}</p>}
          <p className="mt-1 text-muted">{[c.title, c.titleEn].filter(Boolean).join(' · ')}</p>
          <p className="font-medium">{[c.company, c.companyEn].filter(Boolean).join(' · ')}{c.department ? ` — ${c.department}` : ''}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {c.archived && <Badge tone="warn">{t('detail.archived')}</Badge>}
            {c.tags.map((tg) => <TagChip key={tg.id} tag={tg} />)}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" busy={busy === 'star'} onClick={() => run('star', async () => { await api(`contacts/${c.id}`, { method: 'PATCH', body: { starred: !c.starred } }); await refresh(); })}>{c.starred ? '★' : '☆'}</Button>
          <ButtonLink href={`/contacts/${c.id}/edit`} variant="secondary">{t('common.edit')}</ButtonLink>
        </div>
      </div>

      {c.photos.length > 0 && <FlipPhoto id={c.id} sides={c.photos} v={c.photoV} />}
      {note && <Notice>{note}</Notice>}

      <Panel className="divide-y divide-line p-0 sm:p-0">
        {c.phones.map((p) => (
          <Row key={p.e164} label={`${t(`kind.${p.kind}`)}${p.whatsapp ? ' · WhatsApp' : ''}`} value={formatPhone(p.e164)}>
            {p.kind !== 'FAX' && <Act href={`tel:${p.e164}`} label={t('detail.call')}>📞</Act>}
            {(p.whatsapp || p.kind === 'MOBILE') && <Act href={waLink(p.e164)} label="WhatsApp" external>💬</Act>}
            {(p.whatsapp || p.kind === 'MOBILE') && <Act onClick={() => draft('WHATSAPP', p.e164)} label={t('detail.waDraft')}>✍️</Act>}
            <Act onClick={() => copy(p.e164)} label={t('common.copy')}>📋</Act>
          </Row>
        ))}
        {c.emails.map((e) => (
          <Row key={e.email} label={t('f.email')} value={e.email}>
            <Act onClick={() => draft('EMAIL', e.email)} label={t('detail.writeEmail')}>✉️</Act>
            <Act onClick={() => copy(e.email)} label={t('common.copy')}>📋</Act>
          </Row>
        ))}
        {c.website && <Row label={t('f.website')} value={c.website}><Act href={/^https?:/i.test(c.website) ? c.website : `https://${c.website}`} label="↗" external>🌐</Act></Row>}
        {c.address && <Row label={t('f.address')} value={c.address}><Act href={`https://maps.google.com/?q=${encodeURIComponent(c.address)}`} label={t('detail.map')} external>📍</Act><Act onClick={() => copy(c.address)} label={t('common.copy')}>📋</Act></Row>}
        {(c.metAt || c.metOn) && <Row label={t('f.metAt')} value={[c.metAt, c.metOn].filter(Boolean).join(' · ')} />}
        {c.followUpOn && <Row label={t('f.followUpOn')} value={<span className={due ? 'font-semibold text-danger' : ''}>{c.followUpOn}{due ? ` · ${t('detail.dueNow')}` : ''}</span>}>
          <Act onClick={() => run('fu', async () => { await api(`contacts/${c.id}`, { method: 'PATCH', body: { followUpOn: '' } }); await refresh(); })} label={t('detail.followDone')}>✅</Act>
        </Row>}
        {c.notes && <Row label={t('f.notes')} value={<span className="whitespace-pre-wrap">{c.notes}</span>} />}
        {!c.phones.length && !c.emails.length && !c.address && !c.website && <p className="p-4 text-sm text-muted">{t('detail.nothing')}</p>}
      </Panel>

      <Panel>
        <h2 className="mb-3 font-bold">{t('detail.actions')}</h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setShare(!share)}>📤 {t('detail.sendDetails')}</Button>
          <a href={`/api/contacts/${c.id}/vcard`} className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-semibold">📲 {t('detail.addToPhone')}</a>
          <Link href={`/messages/new?contact=${c.id}`} className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-semibold">✍️ {t('detail.newMessage')}</Link>
        </div>
        {share && (
          <div className="mt-3 rounded-xl bg-surface-2 p-3 text-sm">
            <p>{t('detail.sendDetails.sub')}</p>
            <label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={withLink} onChange={(e) => setWithLink(e.target.checked)} /> {t('share.withLink')}</label>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button busy={busy === 's-WHATSAPP'} onClick={() => sendDetails('WHATSAPP')}>💬 WhatsApp</Button>
              <Button variant="secondary" busy={busy === 's-EMAIL'} onClick={() => sendDetails('EMAIL')}>✉️ Email</Button>
            </div>
          </div>
        )}
      </Panel>

      <Panel>
        <h2 className="mb-3 font-bold">{t('detail.history')}</h2>
        {!hist ? <Loading /> : !hist.messages.length ? <p className="text-sm text-muted">{t('detail.noHistory')}</p> : (
          <ul className="divide-y divide-line">
            {hist.messages.map((m) => (
              <li key={m.id}>
                <Link href={`/messages/${m.id}`} className="flex items-center gap-3 py-2.5">
                  <span>{m.channel === 'WHATSAPP' ? '💬' : '✉️'}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{m.subject || m.body.split('\n')[0] || '—'}</span>
                  <Badge tone={m.status === 'SENT' ? 'ok' : m.status === 'FAILED' ? 'danger' : 'neutral'}>{t(`status.${m.status}`)}</Badge>
                  <span className="text-xs text-muted">{ago(m.updatedAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="flex flex-wrap justify-between gap-2 pt-2">
        <Button variant="secondary" busy={busy === 'arch'} onClick={() => run('arch', async () => { await api('contacts/bulk', { body: { ids: [c.id], action: c.archived ? 'unarchive' : 'archive' } }); await refresh(); })}>
          {c.archived ? t('list.unarchive') : t('list.archive')}
        </Button>
        <Button variant="danger" onClick={() => setConfirm(true)}>{t('common.delete')}</Button>
      </div>
      <p className="text-xs text-muted">{t('detail.added', { when: ago(c.createdAt) })}{c.source === 'SCAN' ? ` · ${t('detail.scanned')}` : ''}</p>

      <ConfirmDialog open={confirm} danger busy={busy === 'del'} message={t('detail.confirmDelete')} confirmLabel={t('common.delete')} onClose={() => setConfirm(false)}
        onConfirm={() => run('del', async () => { await api(`contacts/${c.id}`, { method: 'DELETE' }); await mutate((k) => typeof k === 'string' && k.startsWith('contacts?')); await mutate('me'); router.replace('/contacts'); })} />
    </div>
  );
}

function Row({ label, value, children }: { label: string; value: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted">{label}</p>
        <div className="break-words">{value}</div>
      </div>
      {children && <div className="flex shrink-0 gap-1">{children}</div>}
    </div>
  );
}

function Act({ children, label, href, onClick, external }: { children: ReactNode; label: string; href?: string; onClick?: () => void; external?: boolean }) {
  const cls = 'grid size-10 place-items-center rounded-full bg-surface-2 text-lg hover:bg-line';
  if (href) return <a href={href} aria-label={label} title={label} className={cls} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}>{children}</a>;
  return <button type="button" onClick={onClick} aria-label={label} title={label} className={cls}>{children}</button>;
}

export default function Page() {
  return <RequireSignIn><Detail /></RequireSignIn>;
}
