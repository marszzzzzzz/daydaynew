'use client';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import useSWR from 'swr';
import { CardForm } from '@/components/CardForm';
import { RequireSignIn } from '@/components/RequireSignIn';
import { Loading, LoadError, Notice, PageTitle } from '@/components/ui';
import { fetcher } from '@/lib/api';
import { useT } from '@/lib/i18n';
import type { RealCard } from '@/lib/types';

export default function EditCardPage() {
  return <RequireSignIn>{() => <Suspense fallback={<Loading />}><EditCard /></Suspense>}</RequireSignIn>;
}

function EditCard() {
  const { id } = useParams<{ id: string }>();
  const partial = useSearchParams().get('saved') === 'partial';
  const { t } = useT();
  const { data, error, mutate } = useSWR<RealCard[] | null>('real-cards', fetcher);
  const card = data?.find((c) => c.id === id);
  return (
    <div>
      <Link href="/sell" className="mb-4 inline-block text-sm text-muted hover:text-ink">← {t('sell.title')}</Link>
      <PageTitle title={t('form.edit')} />
      {partial && <Notice tone="warn" className="mb-4">{t('form.partial')}</Notice>}
      {error && !data ? <LoadError error={error} retry={() => mutate()} />
        : !data ? <Loading />
        : !card ? <Notice>{t('form.notFound')}</Notice>
        : <CardForm key={card.id} card={card} />}
    </div>
  );
}
