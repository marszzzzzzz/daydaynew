'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import useSWR from 'swr';
import { CardForm } from '@/components/CardForm';
import { RequireSignIn } from '@/components/RequireSignIn';
import { Loading, LoadError, Notice, PageTitle } from '@/components/ui';
import { fetcher } from '@/lib/api';
import { useT } from '@/lib/i18n';
import type { RealCard } from '@/lib/types';

export default function EditCardPage() {
  return <RequireSignIn>{() => <EditCard />}</RequireSignIn>;
}

function EditCard() {
  const { id } = useParams<{ id: string }>();
  const { t } = useT();
  const { data, error, mutate } = useSWR<RealCard[] | null>('real-cards', fetcher);
  const card = data?.find((c) => c.id === id);
  const [deleted, setDeleted] = useState(false);
  return (
    <div>
      <Link href="/sell" className="mb-4 inline-block text-sm text-muted hover:text-ink">← {t('sell.title')}</Link>
      <PageTitle title={t('form.edit')} />
      {error && !data ? <LoadError error={error} retry={() => mutate()} />
        : !data || deleted ? <Loading />
        : !card ? <Notice>{t('form.notFound')}</Notice>
        : <CardForm key={card.id} card={card} onDeleted={() => setDeleted(true)} />}
    </div>
  );
}
