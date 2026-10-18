'use client';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useMe } from '@/lib/hooks';
import { useT } from '@/lib/i18n';
import { ButtonLink, LoadError, Loading, Panel } from './ui';

/** Render children only for a signed-in user; otherwise offer sign-in (and come back here after). */
export function RequireSignIn({ children }: { children: ReactNode }) {
  const { t } = useT();
  const { me, error, mutate } = useMe();
  const path = usePathname();
  if (error) return <LoadError error={error} retry={() => mutate()} />;
  if (me === undefined) return <Loading />;
  if (me === null) {
    return (
      <Panel className="mx-auto max-w-md text-center">
        <p className="mb-4">{t('auth.needed')}</p>
        <div className="flex justify-center gap-2">
          <ButtonLink href={`/login?next=${encodeURIComponent(path)}`}>{t('nav.signin')}</ButtonLink>
          <ButtonLink href="/signup" variant="secondary">{t('nav.signup')}</ButtonLink>
        </div>
      </Panel>
    );
  }
  return <>{children}</>;
}
