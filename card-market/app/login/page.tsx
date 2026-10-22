'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { useSWRConfig } from 'swr';
import { Button, Field, Input, Loading, Notice, Panel } from '@/components/ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { safeNext } from '@/lib/nav';

export default function LoginPage() {
  return <Suspense fallback={<Loading />}><Login /></Suspense>;
}

function Login() {
  const { t, errorText } = useT();
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'));
  const { mutate } = useSWRConfig();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api('auth/login', { body: { name, password } });
      await mutate(() => true, undefined, { revalidate: false });
      await mutate('me');
      router.replace(next);
    } catch (e) {
      setErr(errorText(e));
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md py-6">
      <Panel className="p-6 sm:p-8">
        <h1 className="text-2xl font-bold">{t('login.title')}</h1>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <Field label={t('login.name')}>
            <Input autoComplete="username" required minLength={2} maxLength={24} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label={t('login.password')}>
            <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          {err && <Notice tone="danger">{err}</Notice>}
          <Button type="submit" busy={busy} className="w-full">{t('login.submit')}</Button>
        </form>
        <p className="mt-4 text-xs leading-relaxed text-muted">{t('login.help')}</p>
        <p className="mt-6 text-center text-sm">{t('login.noAccount')} <Link href="/signup" className="font-semibold text-brand">{t('nav.signup')}</Link></p>
        <p className="mt-3 text-center text-xs"><Link href="/login?next=%2Fadmin" className="text-muted hover:text-ink">🛡️ {t('admin.login')}</Link></p>
      </Panel>
    </div>
  );
}
