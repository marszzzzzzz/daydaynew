'use client';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { useSWRConfig } from 'swr';
import { RequireSignIn } from '@/components/RequireSignIn';
import { SignOutButton } from '@/components/SignOut';
import { WhatsAppForm } from '@/components/WhatsAppForm';
import { Badge, Button, Field, Input, Notice, PageTitle, Panel, Select } from '@/components/ui';
import { api } from '@/lib/api';
import { useConfig } from '@/lib/hooks';
import { useT } from '@/lib/i18n';
import { resetTours } from '@/lib/tour';
import type { Me } from '@/lib/types';

export default function AccountPage() {
  return <RequireSignIn>{(me) => <Account me={me} />}</RequireSignIn>;
}

function Account({ me }: { me: Me }) {
  const { t } = useT();
  const router = useRouter();

  return (
    <div className="max-w-2xl">
      <PageTitle title={me.user.name} sub={<Badge>{t(`account.type.${me.user.accountType}`)}</Badge>}
        action={<SignOutButton />} />
      <div className="space-y-5">
        {!me.user.hasPassword && <Notice tone="warn">{t('account.pw.missing')}</Notice>}
        <Panel>
          <h2 className="mb-3 font-bold">{t('account.wa.title')}</h2>
          <WhatsAppForm me={me} />
        </Panel>
        <Panel>
          <h2 className="mb-3 font-bold">{t('account.pw.title')}</h2>
          <PasswordForm hasPassword={me.user.hasPassword} />
        </Panel>
        <Panel>
          <RegionForm me={me} />
        </Panel>
        <Panel className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold">{t('tour.replay')}</h2>
            <p className="text-sm text-muted">{t('tour.replay.d')}</p>
          </div>
          <Button variant="secondary" onClick={() => { resetTours(); router.push('/'); }}>🎓 {t('tour.replay.cta')}</Button>
        </Panel>
      </div>
    </div>
  );
}

function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const { t, errorText } = useT();
  const { mutate } = useSWRConfig();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api('auth/password', { body: { password: next, ...(hasPassword ? { currentPassword: current } : {}) } });
      setCurrent('');
      setNext('');
      setMsg({ tone: 'ok', text: t('account.pw.saved') });
      mutate('me');
    } catch (e) {
      setMsg({ tone: 'danger', text: errorText(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {hasPassword && (
        <Field label={t('account.pw.current')}>
          <Input type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
      )}
      <Field label={t('account.pw.new')}>
        <Input type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={next} onChange={(e) => setNext(e.target.value)} />
      </Field>
      <Button type="submit" busy={busy}>{hasPassword ? t('account.pw.change') : t('account.pw.set')}</Button>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
    </form>
  );
}

function RegionForm({ me }: { me: Me }) {
  const { t, errorText } = useT();
  const { mutate } = useSWRConfig();
  const regions = useConfig()?.config.regions ?? [];
  const [msg, setMsg] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);

  async function change(region: string) {
    setMsg(null);
    try {
      const next = await api<Me>('me', { method: 'PATCH', body: { region: region || null } });
      // PATCH /me answers without dealsNeedingAttention: merge, then refetch the full /me.
      await mutate<Me | null>('me', (cur) => (cur ? { ...cur, ...next } : next));
      setMsg({ tone: 'ok', text: t('account.saved') });
    } catch (e) {
      setMsg({ tone: 'danger', text: errorText(e) });
    }
  }

  return (
    <div className="space-y-3">
      <Field label={t('account.region')}>
        <Select value={me.user.region ?? ''} onChange={(e) => change(e.target.value)}>
          <option value="">{t('account.region.none')}</option>
          {[...new Set([...(me.user.region ? [me.user.region] : []), ...regions])].map((r) => <option key={r} value={r}>{r}</option>)}
        </Select>
      </Field>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
    </div>
  );
}
