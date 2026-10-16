'use client';
// Two-step start for a new collector (spec §2.1): name + password, then WhatsApp (skippable).
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { WhatsAppForm } from '@/components/WhatsAppForm';
import { Button, ButtonLink, Field, Input, Loading, Notice, Panel } from '@/components/ui';
import { api, fetcher } from '@/lib/api';
import { useDebounced, useMe } from '@/lib/hooks';
import { useT } from '@/lib/i18n';

export default function SignupPage() {
  const { me } = useMe();
  const [step, setStep] = useState<1 | 2>(1);
  if (me === undefined) return <Loading />;
  return (
    <div className="mx-auto max-w-md py-6">
      {step === 1 && !me ? <Register onDone={() => setStep(2)} />
        : step === 1 && me?.user.whatsapp ? <Signed />
        : me ? <AddWhatsApp /> : <Loading />}
    </div>
  );
}

function Register({ onDone }: { onDone: () => void }) {
  const { t, errorText } = useT();
  const { mutate } = useSWRConfig();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const checkName = useDebounced(name.trim(), 350);
  const { data: avail } = useSWR<{ name: string; available: boolean } | null>(
    checkName.length >= 2 ? `auth/name-available?name=${encodeURIComponent(checkName)}` : null, fetcher);
  const mismatch = confirm.length > 0 && confirm !== password;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setErr(t('signup.mismatch')); return; }
    setBusy(true);
    setErr(null);
    try {
      await api('auth/register', { body: { name: name.trim(), accountType: 'COLLECTOR', password } });
      await mutate(() => true, undefined, { revalidate: false });
      await mutate('me');
      onDone();
    } catch (e) {
      setErr(errorText(e));
      setBusy(false);
    }
  }

  return (
    <Panel className="p-6 sm:p-8">
      <p className="text-xs font-semibold text-muted">{t('signup.step', { n: 1 })}</p>
      <h1 className="mt-1 text-2xl font-bold">{t('signup.title')}</h1>
      <p className="mt-1 text-sm text-muted">{t('signup.sub')}</p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <Field label={t('signup.name')}
          hint={avail && checkName === name.trim() ? (
            <span className={avail.available ? 'text-ok' : 'text-danger'}>{avail.available ? `✓ ${t('signup.name.ok')}` : `✗ ${t('signup.name.taken')}`}</span>
          ) : undefined}>
          <Input autoComplete="username" required minLength={2} maxLength={24} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t('signup.password')}>
          <Input type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label={t('signup.confirm')} hint={mismatch ? <span className="text-danger">{t('signup.mismatch')}</span> : undefined}>
          <Input type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        {err && <Notice tone="danger">{err}</Notice>}
        <Button type="submit" busy={busy} disabled={avail?.available === false && checkName === name.trim()} className="w-full">{t('signup.submit')}</Button>
      </form>
      <p className="mt-6 text-center text-sm">{t('signup.haveAccount')} <Link href="/login" className="font-semibold text-brand">{t('nav.signin')}</Link></p>
    </Panel>
  );
}

function AddWhatsApp() {
  const { t } = useT();
  const { me } = useMe();
  const router = useRouter();
  if (!me) return <Loading />;
  return (
    <Panel className="p-6 sm:p-8">
      <p className="text-xs font-semibold text-muted">{t('signup.step', { n: 2 })}</p>
      <h1 className="mt-1 text-2xl font-bold">{t('signup.wa.title')}</h1>
      <p className="mt-1 mb-6 text-sm text-muted">{t('signup.wa.sub')}</p>
      <WhatsAppForm me={me} submitLabel={t('account.wa.save')} onSaved={() => router.push('/sell/new')} />
      <ButtonLink href="/sell/new" variant="ghost" className="mt-4 w-full">{t('signup.skip')}</ButtonLink>
    </Panel>
  );
}

function Signed() {
  const { t } = useT();
  return (
    <Notice className="flex items-center justify-between gap-3">
      <span>{t('signup.already')}</span>
      <ButtonLink href="/sell">{t('nav.sell')}</ButtonLink>
    </Notice>
  );
}
