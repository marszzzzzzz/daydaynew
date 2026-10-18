'use client';
// Draft editor (spec §8.2–8.4): autosave 800 ms after typing stops (and when leaving), with the draft's `version`;
// a newer copy from another device shows a conflict choice. WhatsApp opens wa.me with the text; e-mail opens the
// mail app (mailto) or is sent by the system with vCard attachments.
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { ContactPicker } from '@/components/ContactPicker';
import { PhoneInput } from '@/components/PhoneInput';
import { RequireSignIn } from '@/components/RequireSignIn';
import { Badge, Button, ConfirmDialog, Field, Input, LoadError, Loading, Notice, Panel, Select, Textarea } from '@/components/ui';
import { ApiError, api, fetcher } from '@/lib/api';
import { shareLink } from '@/lib/draft';
import { useMe, useTemplates } from '@/lib/hooks';
import { useT } from '@/lib/i18n';
import { formatPhone, waLink } from '@/lib/phone';
import { VARIABLES, cardText, fill, stripVars, unfilled, userCard, variables, waPreview } from '@/lib/template';
import type { Contact, Message } from '@/lib/types';

const MAILTO_MAX = 2000;
type Draft = Pick<Message, 'toAddress' | 'subject' | 'body' | 'attachVcardOf' | 'attachMyCard' | 'contactId'>;
const pick = (m: Message): Draft => ({ toAddress: m.toAddress, subject: m.subject, body: m.body, attachVcardOf: m.attachVcardOf, attachMyCard: m.attachMyCard, contactId: m.contactId });

function Editor() {
  const { t, errorText, ago } = useT();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { mutate: mutateAll } = useSWRConfig();
  const { me } = useMe();
  const { templates } = useTemplates();
  const { data: msg, error, mutate } = useSWR<Message | null>(`messages/${id}`, fetcher, { revalidateOnFocus: false });
  const [d, setD] = useState<Draft | null>(null);
  const [saveState, setSaveState] = useState<'saved' | 'dirty' | 'saving' | 'error'>('saved');
  const [conflict, setConflict] = useState<Message | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const version = useRef(0);
  const dirty = useRef(false);
  const latest = useRef<Draft | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const { data: contact } = useSWR<Contact | null>(d?.contactId ? `contacts/${d.contactId}` : null, fetcher);

  useEffect(() => {
    if (msg && !d) { setD(pick(msg)); version.current = msg.version; latest.current = pick(msg); }
  }, [msg, d]);

  const save = useCallback(async (force?: Message) => {
    if (!latest.current || (!dirty.current && !force)) return;
    dirty.current = false;
    setSaveState('saving');
    try {
      const m = await api<Message>(`messages/${id}`, { method: 'PATCH', body: { ...latest.current, version: force ? force.version : version.current } });
      version.current = m.version;
      setConflict(null);
      setSaveState(dirty.current ? 'dirty' : 'saved');
      mutate(m, { revalidate: false });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'VERSION_CONFLICT') { setConflict(e.data as Message); setSaveState('error'); }
      else { dirty.current = true; setSaveState('error'); setNote(errorText(e)); }
    }
  }, [id, mutate, errorText]);

  // Autosave 800 ms after the last change.
  useEffect(() => {
    if (saveState !== 'dirty' || conflict) return;
    const h = setTimeout(() => save(), 800);
    return () => clearTimeout(h);
  }, [d, saveState, conflict, save]);

  // Save once more when leaving the page or hiding the tab.
  useEffect(() => {
    const flush = () => {
      if (!dirty.current || !latest.current) return;
      fetch(`/api/messages/${id}`, { method: 'PATCH', keepalive: true, credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...latest.current, version: version.current }) }).catch(() => undefined);
      dirty.current = false;
    };
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onHide);
    return () => { flush(); window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', onHide); };
  }, [id]);

  if (error) return <LoadError error={error} retry={() => mutate()} />;
  if (msg === undefined || (msg && !d)) return <Loading />;
  if (msg === null || !d || !me) return <Notice tone="danger">{t('err.NOT_FOUND')}</Notice>;

  const editable = msg.status !== 'SENT';
  const wa = msg.channel === 'WHATSAPP';
  const set = (p: Partial<Draft>) => { const n = { ...d, ...p }; setD(n); latest.current = n; dirty.current = true; setSaveState('dirty'); };
  const vars = variables(contact ?? null, { displayName: me.user.displayName, name: me.user.name, myCompany: me.user.myCompany, whatsapp: me.user.whatsapp, email: me.user.email, signature: me.user.signature });
  const missing = unfilled(`${d.subject}\n${d.body}`);

  /** Insert at the cursor (or append). */
  function insert(text: string) {
    const el = bodyRef.current;
    const at = el ? el.selectionStart : d!.body.length;
    const end = el ? el.selectionEnd : d!.body.length;
    const body = d!.body.slice(0, at) + text + d!.body.slice(end);
    set({ body });
    requestAnimationFrame(() => { if (el) { el.focus(); el.selectionStart = el.selectionEnd = at + text.length; } });
  }

  async function act(key: string, fn: () => Promise<void>) {
    setBusy(key); setNote(null);
    try { await save(); await fn(); } catch (e) { setNote(errorText(e)); } finally { setBusy(null); }
  }
  const post = async (action: string) => { const m = await api<Message>(`messages/${id}/${action}`, { method: 'POST' }); version.current = m.version; await mutate(m, { revalidate: false }); await mutateAll('me'); return m; };

  const finalText = stripVars(d.body).trim();
  const waHref = waLink(d.toAddress || null, finalText);
  const mailto = `mailto:${encodeURIComponent(d.toAddress)}?subject=${encodeURIComponent(stripVars(d.subject))}&body=${encodeURIComponent(finalText)}`;
  const mailTooLong = mailto.length > MAILTO_MAX;
  const canSystem = me.mail.enabled;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href="/messages" className="text-sm text-muted">← {t('msg.title')}</Link>
          <Badge tone={msg.status === 'SENT' ? 'ok' : msg.status === 'FAILED' ? 'danger' : msg.status === 'OPENED' ? 'brand' : 'neutral'}>{wa ? '💬 WhatsApp' : '✉️ Email'} · {t(`status.${msg.status}`)}</Badge>
        </div>
        <span className="text-xs text-muted">{editable ? t(`save.${saveState}`) : msg.sentAt ? t('msg.sentAt', { when: ago(msg.sentAt) }) : ''}</span>
      </div>

      {conflict && (
        <Notice tone="warn">
          <p className="font-semibold">{t('msg.conflict')}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => { setD(pick(conflict)); latest.current = pick(conflict); version.current = conflict.version; dirty.current = false; setConflict(null); setSaveState('saved'); mutate(conflict, { revalidate: false }); }}>{t('msg.loadLatest')}</Button>
            <Button onClick={() => { dirty.current = true; save(conflict); }}>{t('msg.overwrite')}</Button>
          </div>
        </Notice>
      )}
      {msg.status === 'FAILED' && msg.error && <Notice tone="danger">{t('msg.failed', { msg: msg.error })}</Notice>}

      <Panel className="grid gap-4">
        <Field label={t('msg.contact')}>
          {editable ? <ContactPicker value={contact ?? null} onPick={(c) => {
            const to = !c ? d.toAddress : wa ? (c.phones.find((p) => p.whatsapp)?.e164 ?? c.phones.find((p) => p.kind === 'MOBILE')?.e164 ?? d.toAddress) : (c.emails[0]?.email ?? d.toAddress);
            set({ contactId: c?.id ?? null, toAddress: to });
          }} /> : <p>{msg.contactName ?? '—'}</p>}
        </Field>
        <Field label={t('msg.to')} hint={wa ? t('msg.to.waEmpty') : undefined}>
          {!editable ? <p>{wa ? (d.toAddress ? formatPhone(d.toAddress) : '—') : d.toAddress}</p>
            : wa ? (
              <div className="grid gap-2">
                <PhoneInput value={d.toAddress} onChange={(v) => set({ toAddress: v })} country={me.user.defaultCountry} />
                {contact && contact.phones.filter((p) => p.kind !== 'FAX').length > 1 && (
                  <div className="flex flex-wrap gap-1.5">{contact.phones.filter((p) => p.kind !== 'FAX').map((p) => (
                    <button key={p.e164} type="button" onClick={() => set({ toAddress: p.e164 })} className={`rounded-full px-2.5 py-1 text-xs ${d.toAddress === p.e164 ? 'bg-brand text-brand-ink' : 'bg-surface-2'}`}>{formatPhone(p.e164)}{p.whatsapp ? ' · WA' : ''}</button>
                  ))}</div>
                )}
              </div>
            ) : (
              <div className="grid gap-2">
                <Input type="email" value={d.toAddress} onChange={(e) => set({ toAddress: e.target.value.trim() })} placeholder="name@company.com" />
                {contact && contact.emails.length > 1 && (
                  <div className="flex flex-wrap gap-1.5">{contact.emails.map((e) => (
                    <button key={e.email} type="button" onClick={() => set({ toAddress: e.email })} className={`rounded-full px-2.5 py-1 text-xs ${d.toAddress === e.email ? 'bg-brand text-brand-ink' : 'bg-surface-2'}`}>{e.email}</button>
                  ))}</div>
                )}
              </div>
            )}
        </Field>
        {!wa && (
          <Field label={t('msg.subject')}>
            <Input value={d.subject} onChange={(e) => set({ subject: e.target.value })} maxLength={200} readOnly={!editable} />
          </Field>
        )}

        {editable && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Select value="" onChange={(e) => {
              const tp = templates.find((x) => x.id === e.target.value);
              if (!tp) return;
              insert(fill(tp.body, vars).text);
              if (!wa && !d.subject && tp.subject) set({ subject: fill(tp.subject, vars).text });
            }} className="w-auto py-1.5">
              <option value="">{t('msg.insertTemplate')}</option>
              {templates.filter((x) => x.channel === msg.channel).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </Select>
            <Select value="" onChange={(e) => { const k = e.target.value as keyof typeof vars; if (k) insert(vars[k] || `{{${k}}}`); }} className="w-auto py-1.5">
              <option value="">{t('msg.insertVar')}</option>
              {VARIABLES.map((k) => <option key={k} value={k}>{`{{${k}}}`}{vars[k] ? ` — ${vars[k].slice(0, 20)}` : ''}</option>)}
            </Select>
            <Select value="" onChange={(e) => {
              if (e.target.value === 'mine') insert(cardText(userCard(me.user)));
              if (e.target.value === 'theirs' && contact) insert(cardText(contact));
            }} className="w-auto py-1.5">
              <option value="">{t('msg.insertCard')}</option>
              <option value="mine">{t('msg.myCard')}</option>
              {contact && <option value="theirs">{t('msg.theirCard')}</option>}
            </Select>
            {wa && (
              <Select value="" disabled={busy === 'link'} onChange={(e) => {
                const v = e.target.value;
                if (!v) return;
                act('link', async () => { const l = await shareLink(v === 'mine' ? null : contact!.id); insert(`\n${t('share.linkLabel')}${l.url}`); });
              }} className="w-auto py-1.5">
                <option value="">{t('msg.insertLink')}</option>
                <option value="mine">{t('msg.myCard')}</option>
                {contact && <option value="theirs">{t('msg.theirCard')}</option>}
              </Select>
            )}
          </div>
        )}

        <Field label={t('msg.body')} hint={`${d.body.length} / ${wa ? 4000 : 20000}${wa ? ` · ${t('msg.waFormat')}` : ''}`}>
          <Textarea ref={bodyRef} value={d.body} onChange={(e) => set({ body: e.target.value })} readOnly={!editable} maxLength={wa ? 4000 : 20000} className="min-h-56 font-[inherit] leading-relaxed" />
        </Field>
        {missing.length > 0 && (
          <Notice tone="warn" className="flex flex-wrap items-center justify-between gap-2">
            <span>{t('msg.missing', { vars: missing.map((m) => `{{${m}}}`).join(' ') })}</span>
            {editable && <Button variant="secondary" className="py-1.5" onClick={() => set({ body: stripVars(d.body), subject: stripVars(d.subject) })}>{t('msg.clearVars')}</Button>}
          </Notice>
        )}
        {wa && d.body && (
          <div>
            <p className="mb-1 text-xs font-semibold text-muted">{t('msg.preview')}</p>
            <div className="rounded-2xl rounded-tl-sm bg-[#d9fdd3] p-3 text-[15px] text-black" dangerouslySetInnerHTML={{ __html: waPreview(finalText) }} />
          </div>
        )}
        {!wa && editable && (
          <div className="grid gap-1 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={!!d.attachVcardOf} disabled={!contact} onChange={(e) => set({ attachVcardOf: e.target.checked ? contact!.id : null })} /> {t('msg.attachTheirs')}</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={d.attachMyCard} onChange={(e) => set({ attachMyCard: e.target.checked })} /> {t('msg.attachMine')}</label>
            {(d.attachVcardOf || d.attachMyCard) && <p className="text-xs text-muted">{t('msg.attachNote')}</p>}
          </div>
        )}
      </Panel>

      {note && <Notice tone="danger">{note}</Notice>}

      <Panel className="flex flex-wrap items-center gap-2">
        {editable ? (
          <>
            {wa ? (
              <a href={waHref} target="_blank" rel="noreferrer" onClick={() => { save(); post('opened').catch(() => undefined); }}
                className="inline-flex items-center gap-2 rounded-xl bg-[#25d366] px-4 py-2.5 text-sm font-semibold text-black">💬 {t('msg.openWa')}</a>
            ) : (
              <>
                {canSystem && (
                  <Button busy={busy === 'send'} disabled={!me.user.emailVerified || !d.toAddress} onClick={() => act('send', async () => { const m = await post('send'); if (m.status === 'FAILED') setNote(t('msg.failed', { msg: m.error ?? '' })); })}>
                    🚀 {t('msg.sendSystem')}
                  </Button>
                )}
                {mailTooLong ? (
                  <Button variant="secondary" onClick={() => navigator.clipboard?.writeText(finalText).then(() => setNote(t('common.copied')))}>📋 {t('msg.copyBody')}</Button>
                ) : (
                  <a href={mailto} onClick={() => { save(); post('opened').catch(() => undefined); }} className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-semibold">✉️ {t('msg.openMail')}</a>
                )}
              </>
            )}
            <Button variant="secondary" busy={busy === 'sent'} onClick={() => act('sent', async () => { await post('mark-sent'); })}>✓ {t('msg.markSent')}</Button>
            <span className="flex-1" />
            <Button variant="danger" onClick={() => setConfirmDel(true)}>{t('common.delete')}</Button>
          </>
        ) : (
          <Button busy={busy === 'copy'} onClick={() => act('copy', async () => { const m = await api<Message>(`messages/${id}/copy`, { method: 'POST' }); router.push(`/messages/${m.id}`); })}>{t('msg.copy')}</Button>
        )}
      </Panel>
      {editable && !wa && (
        <p className="text-xs text-muted">
          {mailTooLong ? t('msg.mailtoLong') : t('msg.mailtoNote')}{' '}
          {canSystem && !me.user.emailVerified && <Link href="/me" className="text-brand underline">{t('msg.verifyFirst')}</Link>}
          {!canSystem && t('msg.systemOff')}
        </p>
      )}
      {editable && wa && <p className="text-xs text-muted">{t('msg.waNote')}</p>}

      <ConfirmDialog open={confirmDel} danger message={t('msg.confirmDelete')} confirmLabel={t('common.delete')} onClose={() => setConfirmDel(false)}
        onConfirm={async () => { dirty.current = false; await api(`messages/${id}`, { method: 'DELETE' }); await mutateAll('me'); router.replace('/messages'); }} />
    </div>
  );
}

export default function Page() {
  return <RequireSignIn><Editor /></RequireSignIn>;
}
