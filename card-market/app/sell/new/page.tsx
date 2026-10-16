'use client';
import Link from 'next/link';
import { CardForm } from '@/components/CardForm';
import { RequireSignIn } from '@/components/RequireSignIn';
import { PageTitle } from '@/components/ui';
import { useT } from '@/lib/i18n';

export default function NewCardPage() {
  const { t } = useT();
  return (
    <RequireSignIn>
      {() => (
        <div>
          <Link href="/sell" className="mb-4 inline-block text-sm text-muted hover:text-ink">← {t('sell.title')}</Link>
          <PageTitle title={t('form.new')} />
          <CardForm />
        </div>
      )}
    </RequireSignIn>
  );
}
