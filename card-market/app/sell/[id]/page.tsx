'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { CardForm } from '@/components/CardForm';
import { RequireSignIn } from '@/components/RequireSignIn';
import { Button, Loading, LoadError, Notice, PageTitle } from '@/components/ui';
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
  // updatedAt of the copy the form was opened (or last saved) with; null = take the next one as the base.
  const [base, setBase] = useState<number | null>(null);
  const [formKey, setFormKey] = useState(0);
  useEffect(() => { if (card && base === null) setBase(card.updatedAt); }, [card, base]);
  const stale = !!card && base !== null && card.updatedAt !== base;
  return (
    <div>
      <Link href="/sell" className="mb-4 inline-block text-sm text-muted hover:text-ink">← {t('sell.title')}</Link>
      <PageTitle title={t('form.edit')} />
      {error && !data ? <LoadError error={error} retry={() => mutate()} />
        : !data || deleted ? <Loading />
        : !card ? <Notice>{t('form.notFound')}</Notice>
        : (
          <>
            {stale && (
              <Notice tone="warn" className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <span>{t('form.stale')}</span>
                <Button variant="secondary" onClick={() => { setBase(card.updatedAt); setFormKey((k) => k + 1); }}>{t('form.reload')}</Button>
              </Notice>
            )}
            <CardForm key={`${card.id}:${formKey}`} card={card} stale={stale} onSaved={() => setBase(null)} onDeleted={() => setDeleted(true)} />
          </>
        )}
    </div>
  );
}
