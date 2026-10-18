'use client';
// Manual entry (the camera's "single" tab).
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useSWRConfig } from 'swr';
import { ContactForm, formReady, toBody } from '@/components/ContactForm';
import { RequireSignIn } from '@/components/RequireSignIn';
import { Button, Notice, PageTitle, Panel } from '@/components/ui';
import { api } from '@/lib/api';
import { todayHK } from '@/lib/hooks';
import { useT } from '@/lib/i18n';
import { emptyContact, type Contact, type ContactFields } from '@/lib/types';

function NewContact() {
  const { t, errorText } = useT();
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const [v, setV] = useState<ContactFields>(() => ({ ...emptyContact(), metOn: todayHK() }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true); setError(null);
    try {
      const c = await api<Contact>('contacts', { body: { ...toBody(v), source: 'MANUAL' } });
      await Promise.all([mutate((k) => typeof k === 'string' && k.startsWith('contacts')), mutate('me')]);
      router.replace(`/contacts/${c.id}`);
    } catch (e) { setError(errorText(e)); setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle title={t('list.new')} sub={t('new.sub')} />
      <Panel>
        <ContactForm value={v} onChange={(p) => setV({ ...v, ...p })} />
        {error && <Notice tone="danger" className="mt-4">{error}</Notice>}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => router.back()}>{t('common.cancel')}</Button>
          <Button onClick={save} busy={busy} disabled={!formReady(v)}>{t('common.save')}</Button>
        </div>
      </Panel>
    </div>
  );
}

export default function Page() {
  return <RequireSignIn><NewContact /></RequireSignIn>;
}
