'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useTags } from '@/lib/hooks';
import { useT } from '@/lib/i18n';
import type { Tag } from '@/lib/types';

export const TAG_CLASS: Record<string, string> = {
  slate: 'bg-slate-500/15 text-slate-700 dark:text-slate-300',
  blue: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  green: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  amber: 'bg-amber-500/20 text-amber-800 dark:text-amber-300',
  rose: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  violet: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  teal: 'bg-teal-500/15 text-teal-700 dark:text-teal-300',
  orange: 'bg-orange-500/15 text-orange-700 dark:text-orange-300',
};

export const TagChip = ({ tag, className = '' }: { tag: Pick<Tag, 'name' | 'color'>; className?: string }) => (
  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${TAG_CLASS[tag.color] ?? TAG_CLASS.slate} ${className}`}>{tag.name}</span>
);

/** Toggle tags on a contact; a new tag can be typed in and is created on the spot. */
export function TagPicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const { t } = useT();
  const { tags, mutate } = useTags();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  async function create() {
    const n = name.trim();
    if (!n) return;
    const hit = tags.find((x) => x.name.toLowerCase() === n.toLowerCase());
    if (hit) { if (!value.includes(hit.id)) onChange([...value, hit.id]); setName(''); return; }
    setBusy(true);
    try {
      const tag = await api<Tag>('tags', { body: { name: n, color: ['blue', 'green', 'amber', 'rose', 'violet', 'teal', 'orange'][tags.length % 7] } });
      await mutate();
      onChange([...value, tag.id]);
      setName('');
    } catch { /* duplicate or limit: ignore */ } finally { setBusy(false); }
  }
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => {
          const on = value.includes(tag.id);
          return (
            <button key={tag.id} type="button" onClick={() => toggle(tag.id)} aria-pressed={on}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${on ? `${TAG_CLASS[tag.color] ?? TAG_CLASS.slate} ring-2 ring-current` : 'bg-surface-2 text-muted'}`}>
              {on ? '✓ ' : ''}{tag.name}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} placeholder={t('tags.new')}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); create(); } }}
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm" />
        <button type="button" onClick={create} disabled={busy || !name.trim()} className="rounded-lg border border-line px-3 text-sm font-semibold disabled:opacity-40">{t('tags.add')}</button>
      </div>
    </div>
  );
}
