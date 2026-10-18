'use client';
// Duplicates (spec §5): groups with the same phone, e-mail, or name + company. Merging picks, field by field,
// which value to keep; photos, tags and message history all move to the kept contact.
import Link from 'next/link';
import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { RequireSignIn } from '@/components/RequireSignIn';
import { Badge, Button, LoadError, Loading, Notice, PageTitle, Panel } from '@/components/ui';
import { api, fetcher } from '@/lib/api';
import { useT, type Key } from '@/lib/i18n';
import { fullName, type Contact } from '@/lib/types';
import { TEXT_LABEL, type TextKey } from '@/components/ContactForm';

interface Group { reasons: string[]; contacts: Contact[] }
const FIELDS: TextKey[] = ['nameZh', 'nameEn', 'title', 'titleEn', 'company', 'companyEn', 'department', 'address', 'website', 'metAt'];

function Duplicates() {
  const { t } = useT();
  const { data, error, mutate } = useSWR<{ groups: Group[] } | null>('contacts/duplicates', fetcher);
  if (error) return <LoadError error={error} retry={() => mutate()} />;
  if (!data) return <Loading />;
  return (
    <div className="mx-auto max-w-4xl">
      <PageTitle title={t('dup.title')} sub={t('dup.sub')} />
      {!data.groups.length ? <Panel className="text-center text-muted">{t('dup.none')}</Panel> : (
        <div className="space-y-4">{data.groups.map((g) => <GroupCard key={g.contacts.map((c) => c.id).join()} g={g} onDone={() => mutate()} />)}</div>
      )}
    </div>
  );
}

function GroupCard({ g, onDone }: { g: Group; onDone: () => void }) {
  const { t, errorText } = useT();
  const { mutate } = useSWRConfig();
  const [keep, setKeep] = useState(g.contacts[0].id);
  const [pick, setPick] = useState<Partial<Record<TextKey, string>>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const keepC = g.contacts.find((c) => c.id === keep)!;
  // Fields where the contacts disagree: let the user choose.
  const differing = FIELDS.filter((f) => new Set(g.contacts.map((c) => c[f]).filter(Boolean)).size > 1 || (!keepC[f] && g.contacts.some((c) => c[f])));

  async function merge() {
    setBusy(true); setErr(null);
    try {
      const fields: Record<string, string> = {};
      for (const f of differing) fields[f] = pick[f] ?? (keepC[f] || g.contacts.find((c) => c[f])?.[f] || '');
      await api('contacts/merge', { body: { keepId: keep, mergeIds: g.contacts.filter((c) => c.id !== keep).map((c) => c.id), fields } });
      await mutate((k) => typeof k === 'string' && k.startsWith('contacts'));
      await mutate('me');
      onDone();
    } catch (e) { setErr(errorText(e)); setBusy(false); }
  }

  return (
    <Panel>
      <div className="mb-3 flex flex-wrap gap-1">{g.reasons.map((r) => <Badge key={r} tone="warn">{t(`dup.reason.${r}` as Key)}</Badge>)}</div>
      <p className="mb-2 text-sm font-semibold">{t('dup.keep')}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {g.contacts.map((c) => (
          <label key={c.id} className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${keep === c.id ? 'border-brand' : 'border-line'}`}>
            <input type="radio" name={`keep-${g.contacts[0].id}`} checked={keep === c.id} onChange={() => { setKeep(c.id); setPick({}); }} />
            <div className="min-w-0 text-sm">
              <p className="font-semibold">{fullName(c) || '—'}</p>
              <p className="text-muted">{[c.title || c.titleEn, c.company || c.companyEn].filter(Boolean).join(' · ')}</p>
              <p className="text-xs text-muted">{c.phones.map((p) => p.e164).join(', ')} {c.emails.map((e) => e.email).join(', ')}</p>
              <Link href={`/contacts/${c.id}`} className="text-xs text-brand underline" onClick={(e) => e.stopPropagation()}>{t('dup.open')}</Link>
            </div>
          </label>
        ))}
      </div>
      {differing.length > 0 && (
        <div className="mt-4 grid gap-3">
          <p className="text-sm font-semibold">{t('dup.choose')}</p>
          {differing.map((f) => {
            const opts = [...new Set(g.contacts.map((c) => c[f]).filter(Boolean))];
            const cur = pick[f] ?? (keepC[f] || opts[0] || '');
            return (
              <div key={f} className="text-sm">
                <p className="mb-1 text-muted">{t(TEXT_LABEL[f])}</p>
                <div className="flex flex-wrap gap-1.5">
                  {opts.map((o) => (
                    <button key={o} type="button" onClick={() => setPick({ ...pick, [f]: o })}
                      className={`rounded-lg border px-2 py-1 text-left ${cur === o ? 'border-brand bg-brand/10 font-semibold' : 'border-line'}`}>{o}</button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-3 text-xs text-muted">{t('dup.moves')}</p>
      {err && <Notice tone="danger" className="mt-3">{err}</Notice>}
      <div className="mt-3 flex justify-end"><Button onClick={merge} busy={busy}>{t('dup.merge', { n: g.contacts.length })}</Button></div>
    </Panel>
  );
}

export default function Page() {
  return <RequireSignIn><Duplicates /></RequireSignIn>;
}
