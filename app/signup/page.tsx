'use client';
// Sign-up in two steps (spec §10): name + password, then your own WhatsApp / e-mail (can be skipped).
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useSWRConfig } from 'swr';
import { PhoneInput } from '@/components/PhoneInput';
import { Button, Field, Input, Notice, Panel } from '@/components/ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';

export default function SignupPage() {
  const { t, errorText, lang } = useT();
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (password !== password2) { setError(t('auth.mismatch')); return; }
    setBusy(true); setError(null);
    try {
      await api('auth/register', { body: { name, password, lang } });
      await mutate('me');
      setDisplayName(name);
      setStep(2);
    } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  }

  async function finish(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true); setError(null);
    try {
      await api('me', { method: 'PATCH', body: { displayName, whatsapp, email } });
      await mutate('me');
      router.replace('/');
    } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  }

  return (
    <Panel className="mx-auto mt-6 max-w-sm">
      <p className="mb-1 text-xs font-semibold text-muted">{t('auth.step', { n: step })}</p>
      {step === 1 ? (
        <>
          <h1 className="mb-4 text-2xl font-bold">{t('nav.signup')}</h1>
          <form onSubmit={create} className="grid gap-4">
            <Field label={t('auth.name')} hint={t('auth.name.hint')}><Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="username" minLength={2} maxLength={24} required autoFocus /></Field>
            <Field label={t('auth.password')} hint={t('auth.password.hint')}><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={8} required /></Field>
            <Field label={t('auth.password2')}><Input type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} autoComplete="new-password" minLength={8} required /></Field>
            {error && <Notice tone="danger">{error}</Notice>}
            <Button type="submit" busy={busy}>{t('auth.next')}</Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted">{t('auth.haveAccount')} <Link href="/login" className="font-semibold text-brand">{t('nav.signin')}</Link></p>
        </>
      ) : (
        <>
          <h1 className="mb-1 text-2xl font-bold">{t('auth.aboutYou')}</h1>
          <p className="mb-4 text-sm text-muted">{t('auth.aboutYou.sub')}</p>
          <form onSubmit={finish} className="grid gap-4">
            <Field label={t('me.displayName')}><Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={60} /></Field>
            <Field label="WhatsApp"><PhoneInput value={whatsapp} onChange={setWhatsapp} /></Field>
            <Field label={t('f.email')}><Input type="email" value={email} onChange={(e) => setEmail(e.target.value.trim())} autoComplete="email" /></Field>
            {error && <Notice tone="danger">{error}</Notice>}
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => router.replace('/')}>{t('auth.skip')}</Button>
              <Button type="submit" busy={busy} className="flex-1">{t('common.save')}</Button>
            </div>
          </form>
        </>
      )}
    </Panel>
  );
}
