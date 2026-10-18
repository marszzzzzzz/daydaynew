'use client';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { ContactForm, formReady, toBody } from '@/components/ContactForm';
import { RequireSignIn } from '@/components/RequireSignIn';
import { Button, LoadError, Loading, Notice, PageTitle, Panel } from '@/components/ui';
import { api, fetcher } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { fullName, type Contact, type ContactFields } from '@/lib/types';

function Edit() {
  const { t, errorText } = useT();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const { data, error } = useSWR<Contact | null>(`contacts/${id}`, fetcher);
  const [v, setV] = useState<ContactFields | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (data && !v) setV(data); }, [data, v]);

  if (error) return <LoadError error={error} />;
  if (!data || !v) return <Loading />;

  async function save() {
    setBusy(true); setErr(null);
    try {
      const b = toBody(v!);
      await api(`contacts/${id}`, { method: 'PATCH', body: {
        nameZh: b.nameZh, nameEn: b.nameEn, title: b.title, titleEn: b.titleEn, company: b.company, companyEn: b.companyEn, department: b.department,
        address: b.address, website: b.website, notes: b.notes, metAt: b.metAt, metOn: b.metOn, followUpOn: b.followUpOn, starred: b.starred,
        phones: b.phones, emails: b.emails, tagIds: b.tagIds,
      } });
      await Promise.all([mutate(`contacts/${id}`), mutate((k) => typeof k === 'string' && k.startsWith('contacts?')), mutate('me')]);
      router.replace(`/contacts/${id}`);
    } catch (e) { setErr(errorText(e)); setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle title={t('edit.title')} sub={fullName(data)} />
      <Panel>
        <ContactForm value={v} onChange={(p) => setV({ ...v, ...p })} />
        {err && <Notice tone="danger" className="mt-4">{err}</Notice>}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => router.back()}>{t('common.cancel')}</Button>
          <Button onClick={save} busy={busy} disabled={!formReady(v)}>{t('common.save')}</Button>
        </div>
      </Panel>
    </div>
  );
}

export default function Page() {
  return <RequireSignIn><Edit /></RequireSignIn>;
}
