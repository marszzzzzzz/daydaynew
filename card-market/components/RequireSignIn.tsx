'use client';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useMe } from '@/lib/hooks';
import { useT } from '@/lib/i18n';
import type { Me } from '@/lib/types';
import { ButtonLink, Loading, LoadError, Notice } from './ui';

/** Renders children with the signed-in account; otherwise a sign-in prompt. */
export function RequireSignIn({ children }: { children: (me: Me) => ReactNode }) {
  const { me, error, mutate } = useMe();
  const { t } = useT();
  const path = usePathname();
  if (error && me === undefined) return <LoadError error={error} retry={() => mutate()} />;
  if (me === undefined) return <Loading />;
  if (me === null) {
    return (
      <Notice className="flex flex-wrap items-center justify-between gap-3">
        <span>{t('common.signinNeeded')}</span>
        <span className="flex gap-2">
          <ButtonLink href={`/login?next=${encodeURIComponent(path)}`}>{t('nav.signin')}</ButtonLink>
          <ButtonLink href="/signup" variant="secondary">{t('nav.signup')}</ButtonLink>
        </span>
      </Notice>
    );
  }
  return <>{children(me)}</>;
}
