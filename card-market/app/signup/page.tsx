'use client';
// Two-step start for a new collector (spec §2.1): name + password, then WhatsApp (skippable).
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { Blocked } from '@/components/RequireSignIn';
import { WhatsAppForm } from '@/components/WhatsAppForm';
import { Button, ButtonLink, Field, Input, Loading, LoadError, Notice, Panel } from '@/components/ui';
import { api, fetcher } from '@/lib/api';
import { useDebounced, useMe } from '@/lib/hooks';
import { useT } from '@/lib/i18n';
import { safeNext } from '@/lib/nav';

/** Usernames are compared NFKC-normalised with spaces collapsed, as Card Pool stores them. */
const cleanName = (s: string) => s.normalize('NFKC').replace(/\s+/g, ' ').trim();

export default function SignupPage() {
  return <Suspense fallback={<Loading />}><Signup /></Suspense>;
}

function Signup() {
  const { me, error, mutate, blocked } = useMe();
  const [step, setStep] = useState<1 | 2>(1);
  // Where to go once the account is ready: the page that sent the visitor here, else "add a card".
  const raw = useSearchParams().get('next');
  const next = raw ? safeNext(raw) : '/sell/new';
  if (blocked) return <Blocked error={blocked} />;
  if (error && me === undefined) return <LoadError error={error} retry={() => mutate()} />;
  if (me === undefined) return <Loading />;
  return (
    <div className="mx-auto max-w-md py-6">
      {step === 1 && !me ? <Register next={raw ? next : null} onDone={() => setStep(2)} />
        : step === 1 && me?.user.whatsapp ? <Signed next={next} />
        : me ? <AddWhatsApp next={next} /> : <Loading />}
    </div>
  );
}

function Register({ next, onDone }: { next: string | null; onDone: () => void }) {
  const { t, errorText } = useT();
  const { mutate } = useSWRConfig();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const checkName = useDebounced(cleanName(name), 350);
  const { data: avail } = useSWR<{ name: string; available: boolean } | null>(
    checkName.length >= 2 ? `auth/name-available?name=${encodeURIComponent(checkName)}` : null, fetcher);
  const mismatch = confirm.length > 0 && confirm !== password;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const clean = cleanName(name);
    if (clean.length < 2) { setErr(t('signup.nameShort')); return; }
    if (password !== confirm) { setErr(t('signup.mismatch')); return; }
    setBusy(true);
    setErr(null);
    try {
      await api('auth/register', { body: { name: clean, accountType: 'COLLECTOR', password } });
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
          hint={avail && checkName === cleanName(name) ? (
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
        <Button type="submit" busy={busy} disabled={avail?.available === false && checkName === cleanName(name)} className="w-full">{t('signup.submit')}</Button>
      </form>
      <p className="mt-6 text-center text-sm">
        {t('signup.haveAccount')} <Link href={next ? `/login?next=${encodeURIComponent(next)}` : '/login'} className="font-semibold text-brand">{t('nav.signin')}</Link>
      </p>
    </Panel>
  );
}

function AddWhatsApp({ next }: { next: string }) {
  const { t } = useT();
  const { me } = useMe();
  const router = useRouter();
  if (!me) return <Loading />;
  return (
    <Panel className="p-6 sm:p-8">
      <p className="text-xs font-semibold text-muted">{t('signup.step', { n: 2 })}</p>
      <h1 className="mt-1 text-2xl font-bold">{t('signup.wa.title')}</h1>
      <p className="mt-1 mb-6 text-sm text-muted">{t('signup.wa.sub')}</p>
      <WhatsAppForm me={me} submitLabel={t('account.wa.save')} onSaved={() => router.push(next)} />
      <ButtonLink href={next} variant="ghost" className="mt-4 w-full">{t('signup.skip')}</ButtonLink>
    </Panel>
  );
}

function Signed({ next }: { next: string }) {
  const { t } = useT();
  return (
    <Notice className="flex items-center justify-between gap-3">
      <span>{t('signup.already')}</span>
      <ButtonLink href={next}>{t('nav.sell')}</ButtonLink>
    </Notice>
  );
}
