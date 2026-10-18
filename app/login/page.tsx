'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useSWRConfig } from 'swr';
import { Button, Field, Input, Notice, Panel } from '@/components/ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { safeNext } from '@/lib/nav';

function Login() {
  const { t, errorText } = useT();
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'));
  const { mutate } = useSWRConfig();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api('auth/login', { body: { name, password } });
      await mutate('me');
      router.replace(next === '/' ? '/contacts' : next);
    } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  }

  return (
    <Panel className="mx-auto mt-6 max-w-sm">
      <h1 className="mb-4 text-2xl font-bold">{t('nav.signin')}</h1>
      <form onSubmit={submit} className="grid gap-4">
        <Field label={t('auth.name')}><Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="username" required autoFocus /></Field>
        <Field label={t('auth.password')}><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></Field>
        {error && <Notice tone="danger">{error}</Notice>}
        <Button type="submit" busy={busy}>{t('nav.signin')}</Button>
      </form>
      <p className="mt-4 text-center text-sm text-muted">{t('auth.noAccount')} <Link href="/signup" className="font-semibold text-brand">{t('nav.signup')}</Link></p>
    </Panel>
  );
}

export default function LoginPage() {
  return <Suspense><Login /></Suspense>;
}
