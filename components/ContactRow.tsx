'use client';
import Link from 'next/link';
import { todayHK } from '@/lib/hooks';
import { useT } from '@/lib/i18n';
import { waLink } from '@/lib/phone';
import { displayCompany, type Contact } from '@/lib/types';
import { CardPhoto } from './Photo';
import { TagChip } from './Tags';

export function ContactRow({ c, selectable, selected, onSelect }: { c: Contact; selectable?: boolean; selected?: boolean; onSelect?: (on: boolean) => void }) {
  const { t } = useT();
  const wa = c.phones.find((p) => p.whatsapp);
  const due = c.followUpOn && c.followUpOn <= todayHK();
  const title = [c.title || c.titleEn, displayCompany(c)].filter(Boolean).join(' · ');
  return (
    <li className={`flex items-center gap-3 rounded-2xl border bg-surface p-3 ${selected ? 'border-brand' : 'border-line'}`}>
      {selectable && <input type="checkbox" checked={!!selected} onChange={(e) => onSelect?.(e.target.checked)} className="size-5 shrink-0" aria-label={t('list.select')} />}
      <Link href={`/contacts/${c.id}`} className="flex min-w-0 flex-1 items-center gap-3">
        <div className="h-12 w-20 shrink-0 overflow-hidden rounded-lg bg-surface-2">
          {c.photos.length ? <CardPhoto id={c.id} side={c.photos.includes('FRONT') ? 'FRONT' : 'BACK'} v={c.photoV} className="size-full" />
            : <span className="grid size-full place-items-center text-lg font-bold text-muted">{(c.nameZh || c.nameEn || c.company || '?').slice(0, 1).toUpperCase()}</span>}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">
            {c.starred && <span aria-label={t('f.starred')}>⭐ </span>}
            {c.nameZh || c.nameEn || displayCompany(c) || t('list.noName')}
            {c.nameZh && c.nameEn && <span className="font-normal text-muted"> {c.nameEn}</span>}
          </p>
          {title && <p className="truncate text-sm text-muted">{title}</p>}
          {(c.tags.length > 0 || c.followUpOn) && (
            <div className="mt-1 flex flex-wrap items-center gap-1">
              {c.followUpOn && <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${due ? 'bg-danger-soft text-danger' : 'bg-surface-2 text-muted'}`}>⏰ {c.followUpOn}</span>}
              {c.tags.slice(0, 4).map((tag) => <TagChip key={tag.id} tag={tag} />)}
            </div>
          )}
        </div>
      </Link>
      {wa && !selectable && (
        <a href={waLink(wa.e164)} target="_blank" rel="noreferrer" aria-label="WhatsApp" className="grid size-10 shrink-0 place-items-center rounded-full bg-[#25d366]/15 text-lg">💬</a>
      )}
    </li>
  );
}
