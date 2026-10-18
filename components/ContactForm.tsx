'use client';
// The contact fields form, shared by manual entry, edit and the scan review (spec §4.4 step 4–5, §6).
import type { ReactNode } from 'react';
import { useMe } from '@/lib/hooks';
import { useT, type Key } from '@/lib/i18n';
import { formatPhone, toE164 } from '@/lib/phone';
import type { ContactFields, Phone, PhoneKind } from '@/lib/types';
import { TagPicker } from './Tags';
import { Field, Input, Textarea } from './ui';

export type TextKey = 'nameZh' | 'nameEn' | 'title' | 'titleEn' | 'company' | 'companyEn' | 'department' | 'address' | 'website' | 'metAt' | 'notes';
export const TEXT_LABEL: Record<TextKey, Key> = {
  nameZh: 'f.nameZh', nameEn: 'f.nameEn', title: 'f.title', titleEn: 'f.titleEn', company: 'f.company', companyEn: 'f.companyEn',
  department: 'f.department', address: 'f.address', website: 'f.website', metAt: 'f.metAt', notes: 'f.notes',
};
export const MAX: Record<TextKey, number> = { nameZh: 60, nameEn: 80, title: 80, titleEn: 120, company: 120, companyEn: 160, department: 80, address: 300, website: 200, metAt: 120, notes: 2000 };
const KINDS: PhoneKind[] = ['MOBILE', 'OFFICE', 'FAX', 'OTHER'];

/** Phones in the form keep what was typed in `raw`; `e164` is '' while it can't be read. */
export const phoneValid = (p: Phone) => !!p.e164;
export const formReady = (v: ContactFields) => (v.nameZh || v.nameEn || v.company || v.companyEn || v.phones.length || v.emails.length) && v.phones.every(phoneValid);

export function ContactForm({ value, onChange, highlight, compact }: {
  value: ContactFields; onChange: (patch: Partial<ContactFields>) => void; highlight?: TextKey | null; compact?: boolean;
}) {
  const { t } = useT();
  const { me } = useMe();
  const country = me?.user.defaultCountry ?? '852';

  const text = (k: TextKey, extra?: { area?: boolean; ph?: string }) => (
    <Field label={t(TEXT_LABEL[k])} className={highlight === k ? 'rounded-xl ring-2 ring-brand ring-offset-4 ring-offset-surface' : ''}>
      {extra?.area
        ? <Textarea value={value[k]} maxLength={MAX[k]} onChange={(e) => onChange({ [k]: e.target.value })} placeholder={extra?.ph} className="min-h-20" />
        : <Input value={value[k]} maxLength={MAX[k]} onChange={(e) => onChange({ [k]: e.target.value })} placeholder={extra?.ph} />}
    </Field>
  );

  const setPhone = (i: number, patch: Partial<Phone>) => onChange({ phones: value.phones.map((p, j) => (j === i ? { ...p, ...patch } : patch.isPrimary ? { ...p, isPrimary: false } : p)) });
  const setEmail = (i: number, email: string) => onChange({ emails: value.emails.map((e, j) => (j === i ? { ...e, email } : e)) });

  return (
    <div className="grid gap-4">
      <Row>{text('nameZh')}{text('nameEn')}</Row>
      <Row>{text('title')}{text('titleEn')}</Row>
      <Row>{text('company')}{text('companyEn')}</Row>
      {!compact && text('department')}

      <Group label={t('f.phones')} className={highlight === ('phones' as never) ? 'ring-2 ring-brand' : ''}>
        {value.phones.map((p, i) => {
          const bad = !p.e164 && !!p.raw;
          return (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <select value={p.kind} onChange={(e) => setPhone(i, { kind: e.target.value as PhoneKind, whatsapp: e.target.value === 'FAX' ? false : p.whatsapp })}
                className="rounded-lg border border-line bg-surface px-2 py-2 text-sm" aria-label={t('f.kind')}>
                {KINDS.map((k) => <option key={k} value={k}>{t(`kind.${k}`)}</option>)}
              </select>
              <input inputMode="tel" value={p.raw || (p.e164 ? formatPhone(p.e164) : '')} placeholder="+852 9123 4567"
                onChange={(e) => setPhone(i, { raw: e.target.value, e164: toE164(e.target.value, country) ?? '' })}
                className={`min-w-0 flex-1 rounded-lg border bg-surface px-2.5 py-2 text-[15px] ${bad ? 'border-danger' : 'border-line'}`} />
              <label className="flex items-center gap-1 text-sm">
                <input type="checkbox" checked={p.whatsapp} disabled={p.kind === 'FAX'} onChange={(e) => setPhone(i, { whatsapp: e.target.checked })} /> WhatsApp
              </label>
              <button type="button" onClick={() => onChange({ phones: value.phones.filter((_, j) => j !== i) })} className="px-1 text-muted" aria-label={t('common.remove')}>✕</button>
              {bad && <span className="w-full text-xs text-danger">{t('f.badPhone')}</span>}
              {p.e164 && p.raw && <span className="w-full text-xs text-muted">→ {formatPhone(p.e164)}</span>}
            </div>
          );
        })}
        {value.phones.length < 10 && (
          <button type="button" className="self-start text-sm font-semibold text-brand"
            onClick={() => onChange({ phones: [...value.phones, { kind: 'MOBILE', e164: '', raw: '', whatsapp: true, isPrimary: !value.phones.length }] })}>
            + {t('f.addPhone')}
          </button>
        )}
      </Group>

      <Group label={t('f.emails')}>
        {value.emails.map((e, i) => (
          <div key={i} className="flex items-center gap-2">
            <input type="email" inputMode="email" value={e.email} onChange={(ev) => setEmail(i, ev.target.value.trim())} placeholder="name@company.com"
              className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-2.5 py-2 text-[15px]" />
            <button type="button" onClick={() => onChange({ emails: value.emails.filter((_, j) => j !== i) })} className="px-1 text-muted" aria-label={t('common.remove')}>✕</button>
          </div>
        ))}
        {value.emails.length < 10 && (
          <button type="button" className="self-start text-sm font-semibold text-brand" onClick={() => onChange({ emails: [...value.emails, { email: '', isPrimary: !value.emails.length }] })}>
            + {t('f.addEmail')}
          </button>
        )}
      </Group>

      <Row>{text('website', { ph: 'www.example.com' })}{text('address', { area: true })}</Row>

      <Group label={t('f.tags')}><TagPicker value={value.tagIds} onChange={(tagIds) => onChange({ tagIds })} /></Group>

      <Row>
        {text('metAt', { ph: t('f.metAt.ph') })}
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('f.metOn')}><Input type="date" value={value.metOn} onChange={(e) => onChange({ metOn: e.target.value })} /></Field>
          <Field label={t('f.followUpOn')}><Input type="date" value={value.followUpOn} onChange={(e) => onChange({ followUpOn: e.target.value })} /></Field>
        </div>
      </Row>
      {text('notes', { area: true, ph: t('f.notes.ph') })}
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" checked={value.starred} onChange={(e) => onChange({ starred: e.target.checked })} /> ⭐ {t('f.starred')}
      </label>
    </div>
  );
}

const Row = ({ children }: { children: ReactNode }) => <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
const Group = ({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) => (
  <fieldset className={`grid gap-2 rounded-xl ${className}`}>
    <legend className="mb-1.5 text-sm font-medium">{label}</legend>
    {children}
  </fieldset>
);

/** What the API wants: drop empty / unreadable rows. */
export function toBody(v: ContactFields) {
  return {
    ...v,
    phones: v.phones.filter((p) => p.e164),
    emails: v.emails.map((e) => ({ ...e, email: e.email.trim().toLowerCase() })).filter((e) => e.email),
  };
}
