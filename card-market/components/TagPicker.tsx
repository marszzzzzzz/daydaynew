'use client';
// Tags for one card: tap a preset (autograph, patch…) or type your own; tap a chosen tag to remove it.
import { useState } from 'react';
import { useT } from '@/lib/i18n';
import { MAX_TAG, MAX_TAGS, TAG_PRESETS, addTag, isPreset } from '@/lib/meta';
import { tagLabel } from './TagList';

export function TagPicker({ tags, onChange, disabled }: { tags: string[]; onChange: (tags: string[]) => void; disabled?: boolean }) {
  const { t } = useT();
  const [draft, setDraft] = useState('');
  const full = tags.length >= MAX_TAGS;
  const has = (tag: string) => tags.includes(tag);
  const toggle = (tag: string) => onChange(has(tag) ? tags.filter((x) => x !== tag) : addTag(tags, tag));
  const commit = () => { if (draft.trim()) { onChange(addTag(tags, draft)); setDraft(''); } };
  const custom = tags.filter((x) => !isPreset(x));

  // A fieldset, not a <label>: tapping the heading must not toggle the first tag.
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 text-sm font-medium">{t('tags.title')}</legend>
      <div className="flex flex-wrap gap-1.5">
        {TAG_PRESETS.map((p) => (
          <button key={p} type="button" aria-pressed={has(p)} disabled={disabled || (full && !has(p))} onClick={() => toggle(p)}
            className={`rounded-full border px-2.5 py-1 text-sm disabled:opacity-50 ${has(p) ? 'border-brand bg-brand text-brand-ink' : 'border-line bg-surface-2 hover:border-brand'}`}>
            {has(p) ? '✓ ' : ''}{tagLabel(p, t)}
          </button>
        ))}
        {custom.map((x) => (
          <button key={x} type="button" disabled={disabled} onClick={() => toggle(x)} aria-label={t('tags.remove', { tag: x })}
            className="rounded-full border border-brand bg-brand px-2.5 py-1 text-sm text-brand-ink">#{x} ✕</button>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <input value={draft} maxLength={MAX_TAG} disabled={disabled || full} placeholder={full ? t('tags.full', { n: MAX_TAGS }) : t('tags.custom.ph')}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit(); } }}
          aria-label={t('tags.custom')}
          className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-1.5 text-sm outline-none focus:border-brand disabled:opacity-60" />
        <button type="button" onClick={commit} disabled={disabled || full || !draft.trim()}
          className="rounded-xl bg-surface-2 px-3 text-sm font-medium disabled:opacity-50">{t('tags.add')}</button>
      </div>
      <p className="mt-1 text-xs text-muted">{t('tags.hint')}</p>
    </fieldset>
  );
}
