'use client';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useMe } from '@/lib/hooks';
import { useT } from '@/lib/i18n';
import type { ApiError } from '@/lib/api';
import type { Me } from '@/lib/types';
import { SignOutButton } from './SignOut';
import { ButtonLink, Loading, LoadError, Notice } from './ui';

/** Renders children with the signed-in account; otherwise a sign-in prompt. */
export function RequireSignIn({ children }: { children: (me: Me) => ReactNode }) {
  const { me, error, mutate, blocked } = useMe();
  const { t } = useT();
  const path = usePathname();
  if (blocked) return <Blocked error={blocked} />;
  if (error && me === undefined) return <LoadError error={error} retry={() => mutate()} />;
  if (me === undefined) return <Loading />;
  if (me === null) {
    return (
      <Notice className="flex flex-wrap items-center justify-between gap-3">
        <span>{t('common.signinNeeded')}</span>
        <span className="flex gap-2">
          <ButtonLink href={`/login?next=${encodeURIComponent(path)}`}>{t('nav.signin')}</ButtonLink>
          <ButtonLink href={`/signup?next=${encodeURIComponent(path)}`} variant="secondary">{t('nav.signup')}</ButtonLink>
        </span>
      </Notice>
    );
  }
  return <>{children(me)}</>;
}

/** Suspended (or otherwise refused) account: say why and let the person sign out. */
export function Blocked({ error }: { error: ApiError }) {
  const { errorText } = useT();
  return (
    <Notice tone="danger" className="flex flex-wrap items-center justify-between gap-3">
      <span>{errorText(error)}</span>
      <SignOutButton />
    </Notice>
  );
}
