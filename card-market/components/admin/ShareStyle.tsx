'use client';
// Admin: the background behind cards on share pictures, link previews and shared pages. One choice for
// all cards, optionally a different one per category; presets or uploaded pictures. Saved for everyone.
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Button, Loading, LoadError, Notice, Panel, Select } from '@/components/ui';
import { api, fetcher } from '@/lib/api';
import { useConfig } from '@/lib/hooks';
import { useT } from '@/lib/i18n';
import { shrinkPhoto } from '@/lib/image';
import { PRESETS, imageUrl, resolveBg, type Bg, type ThemeConfig } from '@/lib/theme';

const same = (a?: Bg, b?: Bg) => !!a && !!b && a.kind === b.kind && (a.kind === 'preset' ? a.id === (b as typeof a).id : a.key === (b as typeof a).key);

function Swatch({ bg, on, onClick, label }: { bg: Bg; on: boolean; onClick: () => void; label: string }) {
  const r = resolveBg({ all: bg, byCategory: {}, uploads: [] });
  return (
    <button type="button" onClick={onClick} aria-pressed={on} title={label} aria-label={label}
      className={`relative h-16 w-14 shrink-0 overflow-hidden rounded-xl border-2 ${on ? 'border-brand ring-2 ring-brand/30' : 'border-line'}`}
      style={{ background: `linear-gradient(135deg, ${r.from}, ${r.to})` }}>
      {r.image && <img src={r.image} alt="" className="absolute inset-0 size-full object-cover" />}
      {on && <span className="absolute right-1 bottom-1 grid size-5 place-items-center rounded-full bg-brand text-[11px] text-brand-ink">✓</span>}
    </button>
  );
}

/** Presets, then uploaded pictures; `inherit` adds a "same as all cards" choice for a category. */
function BgPicker({ value, onChange, uploads, inherit }: { value: Bg | undefined; onChange: (b: Bg | undefined) => void; uploads: string[]; inherit?: boolean }) {
  const { t, lang } = useT();
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {inherit && (
        <button type="button" onClick={() => onChange(undefined)} aria-pressed={!value}
          className={`grid h-16 w-14 shrink-0 place-items-center rounded-xl border-2 border-dashed text-[11px] leading-tight text-muted ${!value ? 'border-brand text-ink' : 'border-line'}`}>
          {t('style.inherit')}
        </button>
      )}
      {PRESETS.map((p) => <Swatch key={p.id} bg={{ kind: 'preset', id: p.id }} on={same(value, { kind: 'preset', id: p.id })} onClick={() => onChange({ kind: 'preset', id: p.id })} label={p.label[lang === 'zh' ? 0 : 1]} />)}
      {uploads.map((k) => <Swatch key={k} bg={{ kind: 'image', key: k }} on={same(value, { kind: 'image', key: k })} onClick={() => onChange({ kind: 'image', key: k })} label={t('style.uploaded')} />)}
    </div>
  );
}

/** A small mock of the share picture with this background. */
function Preview({ cfg, categoryId }: { cfg: ThemeConfig; categoryId?: string }) {
  const { t } = useT();
  const r = resolveBg(cfg, categoryId);
  return (
    <div className="relative mx-auto w-44 overflow-hidden rounded-2xl text-white shadow-lg" style={{ aspectRatio: '4 / 5', background: `linear-gradient(135deg, ${r.from}, ${r.to})` }}>
      {r.image && <><img src={r.image} alt="" className="absolute inset-0 size-full object-cover" /><span className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/45 to-black/80" /></>}
      <div className="absolute top-3 left-1/2 h-[52%] w-[48%] -translate-x-1/2 -rotate-2 rounded-lg border-2 border-white/90 bg-[#fff6cf] p-1 shadow-lg">
        <div className="size-full rounded bg-gradient-to-br from-[#ffd84a] to-[#e88b2a]" />
      </div>
      <div className="absolute inset-x-3 bottom-3">
        <span className="rounded-full bg-[#34d27b] px-1.5 text-[8px] font-bold text-[#0b1f12]">{t('share.img.listed')}</span>
        <p className="mt-0.5 text-[11px] font-bold">Pikachu 025/165</p>
        <p className="text-sm font-extrabold text-[#FFCB05]">HK$120</p>
      </div>
    </div>
  );
}

export function ShareStyle() {
  const { t, errorText } = useT();
  const config = useConfig();
  const { data, error, mutate } = useSWR<ThemeConfig | null>('share-theme?config=1', fetcher);
  const [cfg, setCfg] = useState<ThemeConfig | null>(null);
  const [cat, setCat] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { if (data && !cfg) setCfg(data); }, [data, cfg]);

  if (error && !data) return <LoadError error={error} retry={() => mutate()} />;
  if (!cfg) return <Loading />;
  const categories = config?.categories.filter((c) => c.active) ?? [];
  const dirty = JSON.stringify(cfg) !== JSON.stringify(data);

  async function upload(file: File | undefined) {
    if (!file || !cfg) return;
    setUploading(true); setMsg(null);
    try {
      const blob = await shrinkPhoto(file);
      const { key } = await api<{ key: string }>('share-theme/background', { body: blob });
      const target: Bg = { kind: 'image', key };
      setCfg((c) => c && ({ ...c, uploads: [key, ...c.uploads.filter((k) => k !== key)].slice(0, 24), ...(cat ? { byCategory: { ...c.byCategory, [cat]: target } } : { all: target }) }));
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    }
    setUploading(false);
  }

  async function save() {
    if (!cfg) return;
    setBusy(true); setMsg(null);
    try {
      const saved = await api<ThemeConfig>('share-theme', { method: 'PUT', body: cfg as unknown as Record<string, unknown> });
      await mutate(saved, { revalidate: false });
      setCfg(saved);
      setMsg({ ok: true, text: t('style.saved') });
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    }
    setBusy(false);
  }

  const setBg = (b: Bg | undefined) => setCfg((c) => {
    if (!c) return c;
    if (!cat) return b ? { ...c, all: b } : c;
    const byCategory = { ...c.byCategory };
    if (b) byCategory[cat] = b; else delete byCategory[cat];
    return { ...c, byCategory };
  });

  return (
    <div className="space-y-4">
      <Notice>{t('style.intro')}</Notice>
      <Panel className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm font-semibold">
            {t('style.for')}
            <Select value={cat} onChange={(e) => setCat(e.target.value)} className="w-auto py-1.5">
              <option value="">{t('style.all')}</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}{cfg.byCategory[c.id] ? ' ●' : ''}</option>)}
            </Select>
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-start">
          <div className="min-w-0 space-y-3">
            <BgPicker value={cat ? cfg.byCategory[cat] : cfg.all} onChange={setBg} uploads={cfg.uploads} inherit={!!cat} />
            <label className={`inline-flex cursor-pointer items-center gap-2 rounded-xl bg-surface-2 px-3.5 py-2 text-sm font-semibold ${uploading ? 'opacity-60' : ''}`}>
              🖼 {uploading ? t('style.uploading') : t('style.upload')}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={uploading}
                onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
            <p className="text-xs text-muted">{t('style.uploadHint')}</p>
          </div>
          <Preview cfg={cfg} categoryId={cat || undefined} />
        </div>
      </Panel>
      {msg && <Notice tone={msg.ok ? 'ok' : 'danger'}>{msg.text}</Notice>}
      <div className="flex justify-end gap-2">
        {dirty && <Button variant="ghost" onClick={() => setCfg(data ?? null)}>{t('style.reset')}</Button>}
        <Button busy={busy} disabled={!dirty} onClick={save}>{t('style.save')}</Button>
      </div>
    </div>
  );
}
