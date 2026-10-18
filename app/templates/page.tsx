'use client';
// Message templates (spec §8.3): per channel, with {{variables}} filled in when a draft is made from them.
import { useState } from 'react';
import { RequireSignIn } from '@/components/RequireSignIn';
import { Button, ConfirmDialog, Field, Input, Loading, Notice, PageTitle, Panel, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import { useTemplates } from '@/lib/hooks';
import { useT } from '@/lib/i18n';
import { VARIABLES } from '@/lib/template';
import type { Channel, Template } from '@/lib/types';

type Edit = { id?: string; channel: Channel; name: string; subject: string; body: string };

function Templates() {
  const { t, errorText } = useT();
  const { templates, mutate, loaded } = useTemplates();
  const [edit, setEdit] = useState<Edit | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [del, setDel] = useState<Template | null>(null);

  async function save() {
    if (!edit) return;
    setBusy(true); setErr(null);
    try {
      if (edit.id) await api(`templates/${edit.id}`, { method: 'PATCH', body: { ...edit } });
      else await api('templates', { body: { ...edit } });
      await mutate();
      setEdit(null);
    } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  }

  if (!loaded) return <Loading />;
  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle title={t('tpl.title')} sub={t('tpl.sub')} action={<Button onClick={() => setEdit({ channel: 'WHATSAPP', name: '', subject: '', body: '' })}>+ {t('tpl.new')}</Button>} />
      {edit && (
        <Panel className="mb-4 grid gap-3">
          <div className="flex gap-2">
            {(['WHATSAPP', 'EMAIL'] as const).map((c) => (
              <button key={c} type="button" onClick={() => setEdit({ ...edit, channel: c })} className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold ${edit.channel === c ? 'border-brand bg-brand/10' : 'border-line'}`}>{c === 'WHATSAPP' ? '💬 WhatsApp' : '✉️ Email'}</button>
            ))}
          </div>
          <Field label={t('tpl.name')}><Input value={edit.name} maxLength={60} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
          {edit.channel === 'EMAIL' && <Field label={t('msg.subject')}><Input value={edit.subject} maxLength={200} onChange={(e) => setEdit({ ...edit, subject: e.target.value })} /></Field>}
          <Field label={t('msg.body')} hint={t('tpl.vars', { vars: VARIABLES.map((v) => `{{${v}}}`).join(' ') })}>
            <Textarea value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} className="min-h-40" />
          </Field>
          <div className="flex flex-wrap gap-1.5">
            {VARIABLES.map((v) => <button key={v} type="button" onClick={() => setEdit({ ...edit, body: `${edit.body}{{${v}}}` })} className="rounded-full bg-surface-2 px-2 py-0.5 font-mono text-xs">{`{{${v}}}`}</button>)}
          </div>
          {err && <Notice tone="danger">{err}</Notice>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEdit(null)}>{t('common.cancel')}</Button>
            <Button onClick={save} busy={busy} disabled={!edit.name.trim() || !edit.body.trim()}>{t('common.save')}</Button>
          </div>
        </Panel>
      )}
      <ul className="grid gap-2">
        {templates.map((x) => (
          <li key={x.id} className="rounded-2xl border border-line bg-surface p-4">
            <div className="flex items-center gap-2">
              <span>{x.channel === 'WHATSAPP' ? '💬' : '✉️'}</span>
              <b className="flex-1">{x.name}</b>
              <button type="button" onClick={() => setEdit({ id: x.id, channel: x.channel, name: x.name, subject: x.subject, body: x.body })} className="text-sm text-brand underline">{t('common.edit')}</button>
              <button type="button" onClick={() => setDel(x)} className="text-sm text-danger underline">{t('common.delete')}</button>
            </div>
            {x.subject && <p className="mt-1 text-sm font-medium">{x.subject}</p>}
            <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-muted">{x.body}</p>
          </li>
        ))}
      </ul>
      <ConfirmDialog open={!!del} danger message={t('tpl.confirmDelete', { name: del?.name ?? '' })} confirmLabel={t('common.delete')} onClose={() => setDel(null)}
        onConfirm={async () => { await api(`templates/${del!.id}`, { method: 'DELETE' }); await mutate(); setDel(null); }} />
    </div>
  );
}

export default function Page() {
  return <RequireSignIn><Templates /></RequireSignIn>;
}
