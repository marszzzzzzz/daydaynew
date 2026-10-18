'use client';
// My card (spec §10 /me): own details, signature, default country, interface language, e-mail verification,
// "send my card", share links, password, export, and deleting the account with all its data (spec §9).
import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { PhoneInput } from '@/components/PhoneInput';
import { RequireSignIn } from '@/components/RequireSignIn';
import { Badge, Button, ConfirmDialog, Field, Input, Notice, PageTitle, Panel, Select, Textarea } from '@/components/ui';
import { api, fetcher } from '@/lib/api';
import { cardDraft } from '@/lib/draft';
import { useMe } from '@/lib/hooks';
import { useT } from '@/lib/i18n';
import { COUNTRIES } from '@/lib/phone';
import { cardText, userCard } from '@/lib/template';
import type { ShareLink, User } from '@/lib/types';

function MePage() {
  const { t, errorText, lang, setLang } = useT();
  const router = useRouter();
  const { me, mutate } = useMe();
  const { mutate: mutateAll } = useSWRConfig();
  const [v, setV] = useState<User | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [pw, setPw] = useState({ current: '', next: '' });
  const [delOpen, setDelOpen] = useState(false);
  const [delPw, setDelPw] = useState('');
  const [withLink, setWithLink] = useState(true);
  const { data: links, mutate: mutateLinks } = useSWR<{ links: ShareLink[] } | null>('share-links', fetcher);
  useEffect(() => { if (me && !v) setV(me.user); }, [me, v]);
  if (!me || !v) return null;

  async function run(key: string, fn: () => Promise<unknown>, ok?: string) {
    setBusy(key); setNote(null);
    try { await fn(); if (ok) setNote({ tone: 'ok', text: ok }); } catch (e) { setNote({ tone: 'danger', text: errorText(e) }); } finally { setBusy(null); }
  }
  const saveProfile = () => run('profile', async () => {
    const r = await api<{ user: User }>('me', { method: 'PATCH', body: {
      displayName: v.displayName, whatsapp: v.whatsapp ?? '', email: v.email ?? '', signature: v.signature, defaultCountry: v.defaultCountry,
      myTitle: v.myTitle, myCompany: v.myCompany, myWebsite: v.myWebsite, myAddress: v.myAddress, uiLang: lang,
    } });
    setV(r.user);
    await mutate();
  }, t('common.saved'));
  const sendCard = (channel: 'WHATSAPP' | 'EMAIL') => run(`card-${channel}`, async () => {
    const m = await cardDraft({ channel, of: null, me: me.user, withLink, linkLabel: t('share.linkLabel') });
    router.push(`/messages/${m.id}`);
  });
  const set = (p: Partial<User>) => setV({ ...v, ...p });
  const changed = JSON.stringify(v) !== JSON.stringify(me.user);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageTitle title={t('me.title')} sub={`${t('auth.name')}: ${me.user.name}`} />
      {note && <Notice tone={note.tone}>{note.text}</Notice>}

      <Panel className="grid gap-4">
        <h2 className="font-bold">{t('me.card')}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('me.displayName')} hint={t('me.displayName.hint')}><Input value={v.displayName} maxLength={60} onChange={(e) => set({ displayName: e.target.value })} /></Field>
          <Field label={t('f.title')} hint={t('me.bilingual')}><Input value={v.myTitle} maxLength={120} onChange={(e) => set({ myTitle: e.target.value })} /></Field>
          <Field label={t('f.company')} hint={t('me.bilingual')}><Input value={v.myCompany} maxLength={160} onChange={(e) => set({ myCompany: e.target.value })} /></Field>
          <Field label={t('f.website')}><Input value={v.myWebsite} maxLength={200} onChange={(e) => set({ myWebsite: e.target.value })} /></Field>
          <Field label="WhatsApp"><PhoneInput value={v.whatsapp ?? ''} onChange={(w) => set({ whatsapp: w || null })} country={v.defaultCountry} /></Field>
          <Field label={t('f.email')} hint={v.email ? (me.user.emailVerified && v.email === me.user.email ? `✓ ${t('me.verified')}` : t('me.unverified')) : undefined}>
            <Input type="email" value={v.email ?? ''} onChange={(e) => set({ email: e.target.value.trim() || null })} />
          </Field>
        </div>
        <Field label={t('f.address')}><Textarea value={v.myAddress} maxLength={300} onChange={(e) => set({ myAddress: e.target.value })} className="min-h-16" /></Field>
        <Field label={t('me.signature')} hint={t('me.signature.hint')}><Textarea value={v.signature} maxLength={500} onChange={(e) => set({ signature: e.target.value })} className="min-h-20" /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('me.country')} hint={t('me.country.hint')}>
            <Select value={v.defaultCountry} onChange={(e) => set({ defaultCountry: e.target.value })}>
              {COUNTRIES.map((c) => <option key={c.code} value={c.code}>+{c.code} {lang === 'zh' ? c.zh : c.en}</option>)}
            </Select>
          </Field>
          <Field label={t('me.lang')}>
            <Select value={lang} onChange={(e) => { setLang(e.target.value as 'zh' | 'en'); api('me', { method: 'PATCH', body: { uiLang: e.target.value } }).catch(() => undefined); }}>
              <option value="zh">中文</option><option value="en">English</option>
            </Select>
          </Field>
        </div>
        <div className="flex justify-end"><Button onClick={saveProfile} busy={busy === 'profile'} disabled={!changed}>{t('common.save')}</Button></div>
      </Panel>

      <Panel>
        <h2 className="mb-2 font-bold">{t('me.sendCard')}</h2>
        <pre className="mb-3 whitespace-pre-wrap rounded-xl bg-surface-2 p-3 font-[inherit] text-sm">{cardText(userCard(me.user)) || '—'}</pre>
        <label className="mb-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={withLink} onChange={(e) => setWithLink(e.target.checked)} /> {t('share.withLink')}</label>
        <div className="flex flex-wrap gap-2">
          <Button busy={busy === 'card-WHATSAPP'} onClick={() => sendCard('WHATSAPP')}>💬 WhatsApp</Button>
          <Button variant="secondary" busy={busy === 'card-EMAIL'} onClick={() => sendCard('EMAIL')}>✉️ Email</Button>
          <a href="/api/me/vcard" className="inline-flex items-center rounded-xl border border-line px-4 py-2.5 text-sm font-semibold">📲 .vcf</a>
        </div>
      </Panel>

      {me.mail.enabled && me.user.email && !me.user.emailVerified && (
        <Panel className="grid gap-3">
          <h2 className="font-bold">{t('me.verifyTitle')}</h2>
          <p className="text-sm text-muted">{t('me.verifySub', { email: me.user.email })}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" busy={busy === 'code'} onClick={() => run('code', async () => { await api('me/email/verify', { method: 'POST' }); setCodeSent(true); }, t('me.codeSent'))}>{codeSent ? t('me.resend') : t('me.sendCode')}</Button>
            {codeSent && (
              <>
                <Input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={6} placeholder="123456" className="w-32" />
                <Button busy={busy === 'confirm'} onClick={() => run('confirm', async () => { await api('me/email/confirm', { body: { code } }); await mutate(); setV(null); }, t('me.verified'))}>{t('me.confirm')}</Button>
              </>
            )}
          </div>
        </Panel>
      )}

      <Panel>
        <h2 className="mb-2 font-bold">{t('me.links')}</h2>
        {!links?.links.length ? <p className="text-sm text-muted">{t('me.noLinks')}</p> : (
          <ul className="divide-y divide-line text-sm">
            {links.links.map((l) => {
              const live = !l.revoked && l.expiresAt > Date.now();
              return (
                <li key={l.token} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="min-w-0 flex-1 truncate">{l.contactName ?? t('msg.myCard')}</span>
                  <Badge tone={live ? 'ok' : 'neutral'}>{l.revoked ? t('me.revoked') : live ? t('me.until', { date: new Date(l.expiresAt).toLocaleDateString() }) : t('me.expired')}</Badge>
                  <span className="text-xs text-muted">{t('me.views', { n: l.views })}</span>
                  {live && <button type="button" className="text-danger underline" onClick={() => run('rev', async () => { await api(`share-links/${l.token}`, { method: 'DELETE' }); await mutateLinks(); })}>{t('me.revoke')}</button>}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel className="grid gap-3">
        <h2 className="font-bold">{t('me.password')}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} placeholder={t('me.currentPw')} autoComplete="current-password" />
          <Input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} placeholder={t('me.newPw')} autoComplete="new-password" minLength={8} />
        </div>
        <div className="flex justify-end"><Button variant="secondary" disabled={!pw.current || pw.next.length < 8} busy={busy === 'pw'}
          onClick={() => run('pw', async () => { await api('me', { method: 'PATCH', body: { currentPassword: pw.current, newPassword: pw.next } }); setPw({ current: '', next: '' }); }, t('me.pwChanged'))}>{t('me.changePw')}</Button></div>
      </Panel>

      <Panel className="grid gap-3">
        <h2 className="font-bold">{t('me.data')}</h2>
        <div className="flex flex-wrap gap-2">
          <a href="/api/contacts/export?format=vcf" className="rounded-xl border border-line px-4 py-2.5 text-sm font-semibold">⬇️ vCard (.vcf)</a>
          <a href="/api/contacts/export?format=csv" className="rounded-xl border border-line px-4 py-2.5 text-sm font-semibold">⬇️ CSV</a>
          <Button variant="ghost" busy={busy === 'out'} onClick={() => run('out', async () => { await api('auth/logout', { method: 'POST' }); await mutateAll(() => true, undefined, { revalidate: false }); await mutate(null, { revalidate: false }); router.replace('/'); })}>{t('me.signOut')}</Button>
          <span className="flex-1" />
          <Button variant="danger" onClick={() => setDelOpen(true)}>{t('me.deleteAccount')}</Button>
        </div>
        <p className="text-xs text-muted">{t('me.privacy')}</p>
      </Panel>

      <ConfirmDialog open={delOpen} danger busy={busy === 'del'} confirmLabel={t('me.deleteAccount')} onClose={() => setDelOpen(false)}
        message={<Confirm><span className="block">{t('me.deleteConfirm')}</span><Input type="password" value={delPw} onChange={(e) => setDelPw(e.target.value)} placeholder={t('auth.password')} className="mt-3" /></Confirm>}
        onConfirm={() => run('del', async () => { await api('me', { method: 'DELETE', body: { password: delPw } }); await mutate(null, { revalidate: false }); router.replace('/'); })} />
    </div>
  );
}

const Confirm = ({ children }: { children: ReactNode }) => <span className="block">{children}</span>;

export default function Page() {
  return <RequireSignIn><MePage /></RequireSignIn>;
}
