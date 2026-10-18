'use client';
// New message: channel, recipient (a contact, any number / address, or none for WhatsApp) and an optional template.
// "One draft per recipient" (spec §8.2): several contacts get one draft each, every one editable on its own.
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import useSWR from 'swr';
import { ContactPicker } from '@/components/ContactPicker';
import { RequireSignIn } from '@/components/RequireSignIn';
import { Button, Field, Loading, Notice, PageTitle, Panel, Select } from '@/components/ui';
import { fetcher } from '@/lib/api';
import { createDraft } from '@/lib/draft';
import { useTemplates } from '@/lib/hooks';
import { useT } from '@/lib/i18n';
import type { Channel, Contact } from '@/lib/types';

function NewMessage() {
  const { t, errorText } = useT();
  const router = useRouter();
  const sp = useSearchParams();
  const [channel, setChannel] = useState<Channel>(sp.get('channel') === 'EMAIL' ? 'EMAIL' : 'WHATSAPP');
  const [picked, setPicked] = useState<Contact[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { templates } = useTemplates();
  const pre = sp.get('contact');
  const { data: preC } = useSWR<Contact | null>(pre ? `contacts/${pre}` : null, fetcher);
  useEffect(() => { if (preC && !picked.length) setPicked([preC]); }, [preC]); // eslint-disable-line react-hooks/exhaustive-deps

  const tpls = templates.filter((x) => x.channel === channel);

  async function create() {
    setBusy(true); setErr(null);
    try {
      const targets = picked.length ? picked : [null];
      let last = '';
      for (const c of targets) last = (await createDraft({ channel, contactId: c?.id ?? null, templateId: templateId || null })).id;
      router.replace(targets.length > 1 ? '/messages' : `/messages/${last}`);
    } catch (e) { setErr(errorText(e)); setBusy(false); }
  }

  if (pre && preC === undefined) return <Loading />;
  return (
    <div className="mx-auto max-w-xl">
      <PageTitle title={t('msg.new')} />
      <Panel className="grid gap-4">
        <div className="flex gap-2">
          {(['WHATSAPP', 'EMAIL'] as const).map((c) => (
            <button key={c} type="button" onClick={() => { setChannel(c); setTemplateId(''); }}
              className={`flex-1 rounded-xl border px-4 py-3 font-semibold ${channel === c ? 'border-brand bg-brand/10' : 'border-line'}`}>{c === 'WHATSAPP' ? '💬 WhatsApp' : '✉️ Email'}</button>
          ))}
        </div>
        <Field label={t('msg.to')} hint={channel === 'WHATSAPP' ? t('msg.to.waHint') : t('msg.to.emailHint')}>
          <div className="grid gap-2">
            {picked.map((c) => <ContactPicker key={c.id} value={c} onPick={() => setPicked(picked.filter((x) => x.id !== c.id))} />)}
            <ContactPicker value={null} onPick={(c) => c && !picked.some((x) => x.id === c.id) && setPicked([...picked, c])} />
          </div>
        </Field>
        {picked.length > 1 && <Notice>{t('msg.perPerson', { n: picked.length })}</Notice>}
        <Field label={t('msg.template')}>
          <Select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">{t('msg.blank')}</option>
            {tpls.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </Select>
        </Field>
        {err && <Notice tone="danger">{err}</Notice>}
        <Button onClick={create} busy={busy}>{picked.length > 1 ? t('msg.createN', { n: picked.length }) : t('msg.create')}</Button>
      </Panel>
    </div>
  );
}

export default function Page() {
  return <RequireSignIn><Suspense fallback={<Loading />}><NewMessage /></Suspense></RequireSignIn>;
}
