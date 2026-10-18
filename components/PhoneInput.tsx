'use client';
// One phone number as E.164: a country code picker plus the local number (from card-market's WhatsAppForm).
import { useEffect, useState } from 'react';
import { useT } from '@/lib/i18n';
import { COUNTRIES, validE164 } from '@/lib/phone';

function split(e164: string, fallback: string) {
  const m = [...COUNTRIES].sort((a, b) => b.code.length - a.code.length).find((c) => e164.startsWith(`+${c.code}`));
  return m ? { code: m.code, local: e164.slice(m.code.length + 1) } : { code: fallback, local: e164.replace(/^\+/, '') };
}

/** `value` / `onChange` are E.164 ('' when empty; the raw text while it isn't a valid number yet). */
export function PhoneInput({ value, onChange, country = '852', allowEmpty = true }: { value: string; onChange: (e164: string) => void; country?: string; allowEmpty?: boolean }) {
  const { t, lang } = useT();
  const [code, setCode] = useState(() => split(value, country).code);
  const [local, setLocal] = useState(() => split(value, country).local);
  useEffect(() => {
    // Follow outside changes (e.g. loading the record) without fighting the user's typing.
    if (value && validE164(value)) { const s = split(value, country); setCode(s.code); setLocal(s.local); }
  }, [value, country]);
  const digits = local.replace(/\D/g, '').replace(/^0+/, '');
  const e164 = digits ? `+${code}${digits}` : '';
  const bad = !!digits && !validE164(e164);
  return (
    <div>
      <div className="flex gap-2">
        <select value={code} onChange={(e) => { setCode(e.target.value); onChange(digits ? `+${e.target.value}${digits}` : ''); }}
          className="w-32 rounded-xl border border-line bg-surface px-2 py-2.5 text-sm" aria-label={t('f.country')}>
          {COUNTRIES.map((c) => <option key={c.code} value={c.code}>+{c.code} {lang === 'zh' ? c.zh : c.en}</option>)}
        </select>
        <input inputMode="tel" value={local} onChange={(e) => { setLocal(e.target.value); const d = e.target.value.replace(/\D/g, '').replace(/^0+/, ''); onChange(d ? `+${code}${d}` : ''); }}
          placeholder="9123 4567" className={`min-w-0 flex-1 rounded-xl border bg-surface px-3 py-2.5 text-[15px] ${bad ? 'border-danger' : 'border-line'}`} />
      </div>
      {bad && <p className="mt-1 text-xs text-danger">{t('f.badPhone')}</p>}
      {!allowEmpty && !digits && <p className="mt-1 text-xs text-muted">{t('f.phoneNeeded')}</p>}
    </div>
  );
}
