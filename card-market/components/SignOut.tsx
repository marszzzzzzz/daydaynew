'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useSWRConfig } from 'swr';
import { ApiError } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { Button } from './ui';

/** Sign out on this device. The cached account is cleared only once the cookie is really gone. */
export function SignOutButton({ variant = 'secondary' }: { variant?: 'secondary' | 'ghost' }) {
  const { t, errorText } = useT();
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function signOut() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/session', { method: 'DELETE' });
      if (!res.ok) throw new ApiError(`Sign-out failed (${res.status})`, res.status, 'SIGNOUT_FAILED');
    } catch (e) {
      setErr(errorText(e instanceof ApiError ? e : new ApiError('Network error', 0, 'NETWORK')));
      setBusy(false);
      return;
    }
    await mutate(() => true, undefined, { revalidate: false });
    await mutate('me', null, { revalidate: false });
    router.push('/');
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button variant={variant} busy={busy} onClick={signOut}>{t('account.signout')}</Button>
      {err && <span role="alert" className="text-xs text-danger">{err}</span>}
    </span>
  );
}
