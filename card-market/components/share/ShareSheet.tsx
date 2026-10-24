'use client';
// Share a card to other apps. Opening the sheet makes a signed share link (/api/share) and draws a share
// picture (1080×1350: photo, name, price, tags, QR code). Then:
// - WhatsApp / Facebook / Threads / X / 微博 / LINE / Telegram: their web share address, with the link.
// - Instagram / 小红书: the phone's share menu with the picture; else the picture is saved and the text copied.
// - WeChat: a QR code to scan in WeChat (or the share menu).
// "More" opens the phone's share menu with the picture, text and link (any app the phone has).
import QRCode from 'qrcode';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { PLATFORMS, hashtags, shareLink, type Platform } from '@/lib/social';
import { tagLabel } from '../TagList';

export interface ShareTarget {
  id: string;
  /** Market search hint (the card's name), so the server can find a listing beyond the newest 200. */
  q?: string;
  name: string;
  detail: string;
  price: number | null;
  currency: string;
  tags: string[];
  serial: string;
  photo: string | null;
  listed: boolean;
}

const W = 1080, H = 1350;

async function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

/** Wrap text to at most `lines` lines of `max` px, ending with … when cut. */
function wrap(g: CanvasRenderingContext2D, text: string, max: number, lines: number) {
  const out: string[] = [];
  let line = '';
  for (const ch of Array.from(text)) {
    if (g.measureText(line + ch).width > max && line) {
      out.push(line);
      line = ch.trimStart();
      if (out.length === lines) break;
    } else line += ch;
  }
  if (out.length < lines && line) out.push(line);
  if (out.length === lines && out.join('').length < Array.from(text).length) out[lines - 1] = `${out[lines - 1].slice(0, -1)}…`;
  return out;
}

async function drawCard(c: ShareTarget, url: string, priceText: string, labels: string[], strings: { listed: string; scan: string; brand: string }) {
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d')!;
  const font = (px: number, weight = 700) => `${weight} ${px}px ui-sans-serif, system-ui, -apple-system, "PingFang HK", "Noto Sans TC", "Microsoft JhengHei", sans-serif`;

  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#121633'); bg.addColorStop(1, '#2b308f');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);

  // The card photo (or a placeholder card), slightly tilted like on the landing page.
  const pw = 560, ph = Math.round(pw * 88 / 63), px = (W - pw) / 2, py = 90;
  g.save();
  g.translate(W / 2, py + ph / 2); g.rotate(-0.03); g.translate(-W / 2, -(py + ph / 2));
  g.shadowColor = 'rgba(0,0,0,0.45)'; g.shadowBlur = 50; g.shadowOffsetY = 20;
  roundRect(g, px, py, pw, ph, 28); g.fillStyle = '#fff6cf'; g.fill();
  g.shadowColor = 'transparent';
  const img = c.photo ? await loadImage(c.photo) : null;
  if (img) {
    g.save(); roundRect(g, px, py, pw, ph, 28); g.clip();
    const k = Math.max(pw / img.width, ph / img.height);
    g.drawImage(img, px + (pw - img.width * k) / 2, py + (ph - img.height * k) / 2, img.width * k, img.height * k);
    g.restore();
  } else {
    g.fillStyle = '#f2c200'; roundRect(g, px + 24, py + 120, pw - 48, ph - 260, 16); g.fill();
    g.fillStyle = '#17192c'; g.font = font(48); g.textAlign = 'center'; g.fillText('🃏', W / 2, py + ph / 2 + 16);
  }
  g.lineWidth = 8; g.strokeStyle = 'rgba(255,255,255,0.9)'; roundRect(g, px, py, pw, ph, 28); g.stroke();
  g.restore();

  // Text block.
  let y = py + ph + 90;
  g.textAlign = 'left';
  if (c.listed) {
    g.font = font(30); const tw = g.measureText(strings.listed).width + 40;
    g.fillStyle = '#34d27b'; roundRect(g, 72, y - 40, tw, 52, 26); g.fill();
    g.fillStyle = '#0b1f12'; g.fillText(strings.listed, 92, y - 3);
    y += 50;
  }
  g.fillStyle = '#ffffff'; g.font = font(62);
  for (const l of wrap(g, c.name, W - 144, 2)) { g.fillText(l, 72, y + 40); y += 72; }
  if (c.detail) { g.fillStyle = 'rgba(255,255,255,0.75)'; g.font = font(32, 500); g.fillText(wrap(g, c.detail, W - 144 - 260, 1)[0] ?? '', 72, y + 30); y += 50; }
  if (labels.length) {
    let x = 72; g.font = font(28, 600);
    for (const t of labels.slice(0, 4)) {
      const tw = g.measureText(t).width + 32;
      if (x + tw > W - 330) break;
      g.fillStyle = 'rgba(255,255,255,0.16)'; roundRect(g, x, y + 4, tw, 46, 12); g.fill();
      g.fillStyle = '#fff'; g.fillText(t, x + 16, y + 37); x += tw + 12;
    }
    y += 64;
  }
  if (priceText) { g.fillStyle = '#FFCB05'; g.font = font(76); g.fillText(priceText, 72, Math.min(y + 70, H - 140)); }

  // QR code to the share link, bottom right.
  const qr = await loadImage(await QRCode.toDataURL(url, { margin: 1, width: 220, color: { dark: '#121633', light: '#ffffff' } }));
  if (qr) {
    g.fillStyle = '#fff'; roundRect(g, W - 72 - 236, H - 72 - 276, 236, 276, 20); g.fill();
    g.drawImage(qr, W - 72 - 228, H - 72 - 268, 220, 220);
    g.fillStyle = '#121633'; g.font = font(22, 600); g.textAlign = 'center'; g.fillText(strings.scan, W - 72 - 118, H - 72 - 18);
  }
  g.textAlign = 'left'; g.fillStyle = 'rgba(255,255,255,0.7)'; g.font = font(26, 600);
  g.fillText(strings.brand, 72, H - 72);

  return new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas'))), 'image/jpeg', 0.92));
}

export function ShareSheet({ card, onClose }: { card: ShareTarget; onClose: () => void }) {
  const { t, money, errorText } = useT();
  const [url, setUrl] = useState<string | null>(null);
  const [image, setImage] = useState<{ blob: Blob; src: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const priceText = card.price === null ? '' : money(card.price, card.currency);
  const labels = [card.serial && `${t('tags.serialBadge')} ${card.serial}`, ...card.tags.map((x) => tagLabel(x, t))].filter(Boolean) as string[];
  const message = (p: Platform | 'native') => [
    t(card.listed ? 'share.text.sale' : 'share.text.collection', { name: card.name }),
    [card.detail, ...labels].filter(Boolean).join(' · '),
    priceText && t('share.text.price', { price: priceText }),
    hashtags(p, card.tags.map((x) => tagLabel(x, t))),
  ].filter(Boolean).join('\n');
  const fileName = `card-${card.id}.jpg`;

  useEffect(() => {
    let live = true;
    let src: string | null = null;
    (async () => {
      try {
        const r = await api<{ url: string }>('share', { body: { id: card.id, q: card.q } });
        if (!live) return;
        setUrl(r.url);
        const blob = await drawCard(card, r.url, priceText, labels, { listed: t('share.img.listed'), scan: t('share.img.scan'), brand: t('share.img.brand') });
        src = URL.createObjectURL(blob);
        if (live) setImage({ blob, src }); else URL.revokeObjectURL(src);
      } catch (e) {
        if (live) setErr(errorText(e));
      }
    })();
    return () => { live = false; if (src) URL.revokeObjectURL(src); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- made once per opening
  }, [card.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); clearTimeout(toastTimer.current); };
  }, [onClose]);

  const say = (m: string) => { setToast(m); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(null), 3500); };
  const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); return true; } catch { return false; } };
  const file = () => (image ? new File([image.blob], fileName, { type: 'image/jpeg' }) : null);
  const canShareFiles = () => { const f = file(); return !!f && typeof navigator.canShare === 'function' && navigator.canShare({ files: [f] }); };

  function save() {
    if (!image) return;
    const a = document.createElement('a');
    a.href = image.src; a.download = fileName; a.click();
  }

  async function nativeShare(p: Platform | 'native', withFile = true) {
    if (!url) return false;
    const f = withFile ? file() : null;
    try {
      if (f && canShareFiles()) await navigator.share({ files: [f], text: `${message(p)}\n${url}` });
      else if (typeof navigator.share === 'function') await navigator.share({ title: card.name, text: message(p), url });
      else return false;
      return true;
    } catch (e) {
      return (e as DOMException)?.name === 'AbortError'; // the person closed the menu: nothing else to do
    }
  }

  async function go(p: Platform) {
    if (!url) return;
    const info = PLATFORMS.find((x) => x.id === p)!;
    if (info.via === 'link') {
      window.open(shareLink(p, url, message(p))!, '_blank', 'noopener,noreferrer');
      return;
    }
    if (p === 'wechat') {
      setQr(await QRCode.toDataURL(url, { margin: 1, width: 480 }));
      return;
    }
    // Instagram / 小红书: picture first.
    if (canShareFiles() && (await nativeShare(p))) return;
    save();
    const copied = await copy(`${message(p)}\n${url}`);
    say(t(copied ? 'share.savedCopied' : 'share.saved', { app: info.label }));
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/55 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="share-title" onClick={(e) => e.stopPropagation()}
        className="motion-safe-anim max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-surface p-5 pb-[max(20px,env(safe-area-inset-bottom))] sm:rounded-3xl"
        style={{ animation: 'tour-pop 220ms ease-out' }}>
        <div className="flex items-center justify-between">
          <h2 id="share-title" className="text-lg font-bold">{t('share.title')}</h2>
          <button type="button" onClick={onClose} aria-label={t('admin.close')} className="grid size-9 place-items-center rounded-full bg-surface-2">✕</button>
        </div>

        <div className="mx-auto mt-3 w-44 overflow-hidden rounded-2xl bg-surface-2 shadow-lg" style={{ aspectRatio: `${W} / ${H}` }}>
          {image ? <img src={image.src} alt={t('share.preview')} className="size-full object-cover" />
            : <span className="grid size-full place-items-center text-xs text-muted">{err ? '—' : t('share.making')}</span>}
        </div>
        {err && <p className="mt-3 text-center text-sm text-danger">{err}</p>}

        <ul className="mt-5 grid grid-cols-5 gap-x-2 gap-y-4">
          {PLATFORMS.map((p) => (
            <li key={p.id}>
              <button type="button" disabled={!url} onClick={() => go(p.id)} className="flex w-full flex-col items-center gap-1.5 disabled:opacity-40" aria-label={t('share.to', { app: p.label })}>
                <span className="grid size-12 place-items-center rounded-full text-sm font-extrabold text-white shadow" style={{ background: p.color }} aria-hidden>{p.mark}</span>
                <span className="w-full truncate text-center text-[11px] text-muted">{p.label}</span>
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-5 grid grid-cols-3 gap-2">
          <button type="button" disabled={!url} onClick={async () => say(t((await copy(url!)) ? 'share.copied' : 'share.copyFailed'))} className="rounded-xl bg-surface-2 py-2.5 text-sm font-semibold disabled:opacity-40">🔗 {t('share.copyLink')}</button>
          <button type="button" disabled={!image} onClick={save} className="rounded-xl bg-surface-2 py-2.5 text-sm font-semibold disabled:opacity-40">⬇️ {t('share.saveImage')}</button>
          <button type="button" disabled={!url} onClick={async () => { if (!(await nativeShare('native'))) say(t('share.noMenu')); }} className="rounded-xl bg-brand py-2.5 text-sm font-semibold text-brand-ink disabled:opacity-40">📤 {t('share.more')}</button>
        </div>
        <p className="mt-3 text-center text-xs text-muted">{t('share.hint')}</p>
        {toast && <p role="status" className="mt-3 rounded-xl bg-ok-soft px-3 py-2 text-center text-sm text-ok">{toast}</p>}
      </div>

      {qr && (
        <div className="fixed inset-0 z-[75] grid place-items-center bg-black/60 p-4" onClick={(e) => { e.stopPropagation(); setQr(null); }}>
          <div role="dialog" aria-modal="true" className="w-full max-w-xs rounded-3xl bg-surface p-5 text-center" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold">{t('share.wechat.title')}</h3>
            <img src={qr} alt="QR" className="mx-auto mt-3 w-56 rounded-xl" />
            <p className="mt-2 text-sm text-muted">{t('share.wechat.body')}</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" onClick={async () => { await nativeShare('wechat'); }} className="rounded-xl bg-[#07C160] py-2.5 text-sm font-semibold text-white">{t('share.more')}</button>
              <button type="button" onClick={() => setQr(null)} className="rounded-xl bg-surface-2 py-2.5 text-sm font-semibold">{t('admin.close')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** The 📤 button that opens the sheet. */
export function ShareButton({ card, className = '', compact }: { card: ShareTarget; className?: string; compact?: boolean }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={t('share.button')}
        className={`inline-flex items-center gap-1.5 rounded-xl font-semibold ${compact ? 'px-2 py-1 text-sm text-brand' : 'bg-surface-2 px-3.5 py-2 text-sm hover:bg-line'} ${className}`}>
        <span aria-hidden>📤</span>{compact ? null : t('share.button')}
      </button>
      {open && <ShareSheet card={card} onClose={() => setOpen(false)} />}
    </>
  );
}
