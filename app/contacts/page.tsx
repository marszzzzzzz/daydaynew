'use client';
// Contacts (spec §5): search, filters, sort, grouping, multi-select bulk actions and export.
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import useSWR from 'swr';
import { ContactRow } from '@/components/ContactRow';
import { RequireSignIn } from '@/components/RequireSignIn';
import { TAG_CLASS } from '@/components/Tags';
import { Button, ButtonLink, ConfirmDialog, Input, LoadError, Loading, Notice, Select } from '@/components/ui';
import { api, fetcher } from '@/lib/api';
import { useDebounced, useTags } from '@/lib/hooks';
import { useT, type Key } from '@/lib/i18n';
import { displayCompany, type Contact } from '@/lib/types';

const FILTERS = ['incomplete', 'starred', 'wa', 'email', 'due', 'archived'] as const;
const SORTS = ['new', 'updated', 'name', 'company', 'followup'] as const;
type Group = 'none' | 'company' | 'tag' | 'metAt';

function Contacts() {
  const { t, errorText } = useT();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get('q') ?? '');
  const [filters, setFilters] = useState<Record<string, boolean>>(() => Object.fromEntries(FILTERS.map((f) => [f, sp.get(f) === '1'])));
  const [tagSel, setTagSel] = useState<string[]>(sp.get('tag')?.split(',').filter(Boolean) ?? []);
  const [sort, setSort] = useState<string>(sp.get('sort') ?? 'new');
  const [group, setGroup] = useState<Group>('none');
  const [limit, setLimit] = useState(100);
  const [selecting, setSelecting] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const { tags } = useTags();
  const dq = useDebounced(q.trim(), 300);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (dq) p.set('q', dq);
    for (const f of FILTERS) if (filters[f]) p.set(f, '1');
    if (tagSel.length) p.set('tag', tagSel.join(','));
    p.set('sort', sort);
    return p;
  }, [dq, filters, tagSel, sort]);
  const key = `contacts?${params}&limit=${limit}`;
  const { data, error, mutate, isLoading } = useSWR<{ contacts: Contact[]; nextCursor: string | null } | null>(key, fetcher, { keepPreviousData: true });
  const contacts = data?.contacts ?? [];

  const groups = useMemo(() => {
    if (group === 'none') return [{ name: '', items: contacts }];
    const m = new Map<string, Contact[]>();
    const push = (k: string, c: Contact) => m.set(k, [...(m.get(k) ?? []), c]);
    for (const c of contacts) {
      if (group === 'company') push(displayCompany(c) || '—', c);
      else if (group === 'metAt') push(c.metAt || '—', c);
      else if (!c.tags.length) push('—', c);
      else c.tags.forEach((tg) => push(tg.name, c));
    }
    return [...m.entries()].sort(([a], [b]) => (a === '—' ? 1 : b === '—' ? -1 : a.localeCompare(b))).map(([name, items]) => ({ name, items }));
  }, [contacts, group]);

  const toggle = (id: string, on: boolean) => setSel((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
  const ids = [...sel];

  async function bulk(action: string, tagId?: string) {
    setBusy(true); setNote(null);
    try {
      const r = await api<{ count: number }>('contacts/bulk', { body: { ids, action, tagId } });
      setNote(t('list.bulkDone', { n: r.count }));
      if (action === 'delete' || action === 'archive' || action === 'unarchive') setSel(new Set());
      await mutate();
    } catch (e) { setNote(errorText(e)); } finally { setBusy(false); setConfirmDelete(false); }
  }

  const exportHref = (format: 'vcf' | 'csv') => `/api/contacts/export?format=${format}${ids.length ? `&ids=${ids.join(',')}` : ''}`;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t('list.title')}</h1>
          <p className="mt-1 text-sm text-muted">{data ? t('list.count', { n: contacts.length + (data.nextCursor ? '+' : '') }) : ' '}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/scan">📷 {t('nav.scan')}</ButtonLink>
          <ButtonLink href="/contacts/new" variant="secondary">+ {t('list.new')}</ButtonLink>
        </div>
      </div>

      <div className="grid gap-3">
        <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('list.search')} />
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTERS.map((f) => (
            <button key={f} type="button" onClick={() => setFilters({ ...filters, [f]: !filters[f] })} aria-pressed={filters[f]}
              className={`rounded-full px-3 py-1 text-sm font-medium ${filters[f] ? 'bg-brand text-brand-ink' : 'bg-surface-2 text-muted'}`}>{t(`filter.${f}` as Key)}</button>
          ))}
          <span className="mx-1 h-5 w-px bg-line" />
          {tags.map((tg) => {
            const on = tagSel.includes(tg.id);
            return (
              <button key={tg.id} type="button" onClick={() => setTagSel(on ? tagSel.filter((x) => x !== tg.id) : [...tagSel, tg.id])} aria-pressed={on}
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${on ? `${TAG_CLASS[tg.color]} ring-2 ring-current` : 'bg-surface-2 text-muted'}`}>
                {tg.name}{tg.count ? ` ${tg.count}` : ''}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-1.5 whitespace-nowrap">{t('list.sort')}
            <Select value={sort} onChange={(e) => setSort(e.target.value)} className="w-auto py-1.5">{SORTS.map((s) => <option key={s} value={s}>{t(`sort.${s}` as Key)}</option>)}</Select>
          </label>
          <label className="flex items-center gap-1.5 whitespace-nowrap">{t('list.group')}
            <Select value={group} onChange={(e) => setGroup(e.target.value as Group)} className="w-auto py-1.5">
              {(['none', 'company', 'tag', 'metAt'] as Group[]).map((g) => <option key={g} value={g}>{t(`group.${g}` as Key)}</option>)}
            </Select>
          </label>
          <span className="ml-auto flex gap-2">
            <Link href="/contacts/duplicates" className="font-semibold text-brand">{t('list.duplicates')}</Link>
            <button type="button" onClick={() => { setSelecting(!selecting); setSel(new Set()); }} className="font-semibold text-brand">{selecting ? t('list.done') : t('list.selectMode')}</button>
          </span>
        </div>
      </div>

      {selecting && (
        <div className="sticky top-14 z-10 mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface p-3 text-sm shadow-sm">
          <b>{t('list.selected', { n: sel.size })}</b>
          <button type="button" className="text-brand underline" onClick={() => setSel(new Set(contacts.map((c) => c.id)))}>{t('list.selectAll')}</button>
          <span className="flex-1" />
          <Select disabled={!sel.size || busy} value="" onChange={(e) => { const [a, id] = e.target.value.split(':'); if (id) bulk(a, id); }} className="w-auto py-1.5">
            <option value="">{t('list.tagAction')}</option>
            {tags.map((tg) => <option key={`t${tg.id}`} value={`tag:${tg.id}`}>+ {tg.name}</option>)}
            {tags.map((tg) => <option key={`u${tg.id}`} value={`untag:${tg.id}`}>− {tg.name}</option>)}
          </Select>
          <Button variant="secondary" className="py-1.5" disabled={!sel.size || busy} onClick={() => bulk(filters.archived ? 'unarchive' : 'archive')}>{filters.archived ? t('list.unarchive') : t('list.archive')}</Button>
          <a href={exportHref('vcf')} className={`rounded-xl border border-line px-3 py-1.5 font-semibold ${sel.size ? '' : 'pointer-events-none opacity-40'}`}>vCard</a>
          <a href={exportHref('csv')} className={`rounded-xl border border-line px-3 py-1.5 font-semibold ${sel.size ? '' : 'pointer-events-none opacity-40'}`}>CSV</a>
          <Button variant="danger" className="py-1.5" disabled={!sel.size || busy} onClick={() => setConfirmDelete(true)}>{t('common.delete')}</Button>
        </div>
      )}
      {note && <Notice className="mt-3">{note}</Notice>}

      <div className="mt-4">
        {error ? <LoadError error={error} retry={() => mutate()} /> : !data && isLoading ? <Loading /> : !contacts.length ? (
          <div className="rounded-2xl border border-dashed border-line px-6 py-12 text-center text-muted">
            {dq || tagSel.length || FILTERS.some((f) => filters[f]) ? t('list.noMatch') : t('home.empty')}
          </div>
        ) : (
          <div className="space-y-5">
            {groups.map((g) => (
              <section key={g.name || 'all'}>
                {g.name && <h2 className="mb-2 text-sm font-bold text-muted">{g.name} · {g.items.length}</h2>}
                <ul className="grid gap-2 lg:grid-cols-2">
                  {g.items.map((c) => <ContactRow key={`${g.name}-${c.id}`} c={c} selectable={selecting} selected={sel.has(c.id)} onSelect={(on) => toggle(c.id, on)} />)}
                </ul>
              </section>
            ))}
            {data?.nextCursor && <div className="text-center"><Button variant="secondary" onClick={() => setLimit(limit + 200)}>{t('list.more')}</Button></div>}
          </div>
        )}
      </div>

      <div className="mt-8 flex flex-wrap gap-3 text-sm text-muted">
        <span>{t('list.exportAll')}</span>
        <a href="/api/contacts/export?format=vcf" className="font-semibold text-brand">vCard (.vcf)</a>
        <a href="/api/contacts/export?format=csv" className="font-semibold text-brand">CSV (Excel)</a>
      </div>

      <ConfirmDialog open={confirmDelete} danger busy={busy} message={t('list.confirmDelete', { n: sel.size })} confirmLabel={t('common.delete')}
        onConfirm={() => bulk('delete')} onClose={() => setConfirmDelete(false)} />
    </div>
  );
}

export default function ContactsPage() {
  return <RequireSignIn><Suspense fallback={<Loading />}><Contacts /></Suspense></RequireSignIn>;
}
