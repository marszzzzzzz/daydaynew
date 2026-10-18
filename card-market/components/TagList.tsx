// Read-only tag and serial-number badges for a card.
import type { Key } from '@/lib/i18n';
import { isPreset } from '@/lib/meta';

export const tagLabel = (tag: string, t: (k: Key) => string) => (isPreset(tag) ? t(`tag.${tag}`) : tag);

export function TagList({ tags, serial, t, className = '' }: { tags: string[]; serial?: string; t: (k: Key) => string; className?: string }) {
  if (!tags.length && !serial) return null;
  return (
    <span className={`flex flex-wrap gap-1 ${className}`}>
      {serial && <span className="rounded-md bg-warn-soft px-1.5 py-0.5 text-xs font-semibold text-warn">{t('tags.serialBadge')} {serial}</span>}
      {tags.map((x) => <span key={x} className="rounded-md bg-brand/10 px-1.5 py-0.5 text-xs font-medium text-brand">{tagLabel(x, t)}</span>)}
    </span>
  );
}
