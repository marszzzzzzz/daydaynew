'use client';
import { useState, type FormEvent } from 'react';
import { useSWRConfig } from 'swr';
import { api } from '@/lib/api';
import { WHATSAPP_COUNTRIES, formatWhatsApp } from '@/lib/cards';
import { useT } from '@/lib/i18n';
import type { Me } from '@/lib/types';
import { Button, ConfirmDialog, Field, Input, Notice, Select } from './ui';

/** Set or remove the WhatsApp number used for selling (POST /me/whatsapp). */
export function WhatsAppForm({ me, onSaved, submitLabel }: { me: Me; onSaved?: () => void; submitLabel?: string }) {
  const { t, lang, errorText } = useT();
  const { mutate } = useSWRConfig();
  const current = me.user.whatsapp;
  const [country, setCountry] = useState<string>(() => WHATSAPP_COUNTRIES.find((c) => current?.startsWith(`+${c.code}`))?.code ?? '852');
  const [number, setNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  async function save(body: Record<string, unknown>) {
    setBusy(true);
    setMsg(null);
    try {
      const next = await api<Me>('me/whatsapp', { body });
      // The reply has no dealsNeedingAttention: merge, then refetch the full /me.
      await mutate<Me | null>('me', (cur) => (cur ? { ...cur, ...next } : next));
      mutate('real-cards');
      setNumber('');
      setMsg({ tone: 'ok', text: t('account.saved') });
      onSaved?.();
    } catch (e) {
      setMsg({ tone: 'danger', text: errorText(e) });
    } finally {
      setBusy(false);
      setConfirmClear(false);
    }
  }

  return (
    <form onSubmit={(e: FormEvent) => { e.preventDefault(); save({ country, number }); }} className="space-y-3">
      {current && (
        <p className="text-sm">{t('account.wa.current')}: <b className="tracking-wide">{formatWhatsApp(current)}</b></p>
      )}
      <div className="grid grid-cols-[minmax(0,10rem)_1fr] gap-2">
        <Field label={t('account.wa.country')}>
          <Select value={country} onChange={(e) => setCountry(e.target.value)}>
            {WHATSAPP_COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c[lang]} +{c.code}</option>)}
          </Select>
        </Field>
        <Field label={t('account.wa.number')}>
          <Input type="tel" inputMode="tel" autoComplete="tel-national" required value={number} onChange={(e) => setNumber(e.target.value)}
            placeholder={country === '852' ? '9123 4567' : ''} />
        </Field>
      </div>
      <p className="text-xs text-muted">🔒 {t('account.wa.hint')}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" busy={busy}>{submitLabel ?? t('account.wa.save')}</Button>
        {current && <Button type="button" variant="danger" onClick={() => setConfirmClear(true)} disabled={busy}>{t('account.wa.clear')}</Button>}
      </div>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <ConfirmDialog open={confirmClear} danger busy={busy} message={t('account.wa.clearWarn')} confirmLabel={t('account.wa.clear')}
        onConfirm={() => save({ clear: true })} onClose={() => setConfirmClear(false)} />
    </form>
  );
}
