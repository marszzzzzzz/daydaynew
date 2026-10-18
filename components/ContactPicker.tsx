'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { fetcher } from '@/lib/api';
import { useDebounced } from '@/lib/hooks';
import { useT } from '@/lib/i18n';
import { displayCompany, fullName, type Contact } from '@/lib/types';

/** Search-as-you-type contact chooser. */
export function ContactPicker({ value, onPick }: { value: Contact | null; onPick: (c: Contact | null) => void }) {
  const { t } = useT();
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim(), 250);
  const { data } = useSWR<{ contacts: Contact[] } | null>(dq ? `contacts?q=${encodeURIComponent(dq)}&limit=8&sort=name` : null, fetcher);
  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2">
        <span className="min-w-0 flex-1 truncate font-semibold">{fullName(value) || displayCompany(value)}<span className="font-normal text-muted"> {displayCompany(value)}</span></span>
        <button type="button" onClick={() => onPick(null)} className="text-sm text-muted underline">{t('picker.change')}</button>
      </div>
    );
  }
  return (
    <div className="relative">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('picker.search')} className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-[15px]" />
      {dq && data && (
        <ul className="absolute inset-x-0 top-full z-10 mt-1 max-h-72 overflow-auto rounded-xl border border-line bg-surface shadow-lg">
          {data.contacts.length ? data.contacts.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => { onPick(c); setQ(''); }} className="block w-full px-3 py-2 text-left hover:bg-surface-2">
                <span className="font-semibold">{fullName(c) || '—'}</span> <span className="text-sm text-muted">{displayCompany(c)}</span>
              </button>
            </li>
          )) : <li className="px-3 py-2 text-sm text-muted">{t('list.noMatch')}</li>}
        </ul>
      )}
    </div>
  );
}
