// Where a share can go, and how. Platforms with a web "share" address open it in a new tab; Instagram,
// 小红书 and WeChat have none, so they go through the phone's share menu with the picture (or the picture is
// saved and the text copied, and WeChat also gets a QR code to scan).
export type Platform =
  | 'whatsapp' | 'facebook' | 'instagram' | 'threads' | 'x' | 'xiaohongshu'
  | 'weibo' | 'wechat' | 'line' | 'telegram';

export interface PlatformInfo {
  id: Platform;
  label: string;
  /** Brand colour of the round icon. */
  color: string;
  /** Short mark shown in the icon. */
  mark: string;
  /** How it shares: a web address, or the picture through the share menu / save + copy. */
  via: 'link' | 'image' | 'qr';
}

export const PLATFORMS: PlatformInfo[] = [
  { id: 'whatsapp', label: 'WhatsApp', color: '#25D366', mark: 'W', via: 'link' },
  { id: 'facebook', label: 'Facebook', color: '#1877F2', mark: 'f', via: 'link' },
  { id: 'instagram', label: 'Instagram', color: '#E1306C', mark: 'IG', via: 'image' },
  { id: 'threads', label: 'Threads', color: '#111111', mark: '@', via: 'link' },
  { id: 'x', label: 'X', color: '#000000', mark: '𝕏', via: 'link' },
  { id: 'xiaohongshu', label: '小红书', color: '#FF2442', mark: '小红', via: 'image' },
  { id: 'weibo', label: '微博', color: '#E6162D', mark: '微', via: 'link' },
  { id: 'wechat', label: 'WeChat', color: '#07C160', mark: '微信', via: 'qr' },
  { id: 'line', label: 'LINE', color: '#06C755', mark: 'L', via: 'link' },
  { id: 'telegram', label: 'Telegram', color: '#229ED9', mark: 'T', via: 'link' },
];

const e = encodeURIComponent;

/** The web share address for a platform that has one. `text` is the message without the link. */
export function shareLink(p: Platform, url: string, text: string): string | null {
  switch (p) {
    case 'whatsapp': return `https://wa.me/?text=${e(`${text}\n${url}`)}`;
    case 'facebook': return `https://www.facebook.com/sharer/sharer.php?u=${e(url)}`;
    case 'threads': return `https://www.threads.net/intent/post?text=${e(`${text} ${url}`)}`;
    case 'x': return `https://twitter.com/intent/tweet?text=${e(text)}&url=${e(url)}`;
    case 'weibo': return `https://service.weibo.com/share/share.php?url=${e(url)}&title=${e(text)}`;
    case 'line': return `https://social-plugins.line.me/lineit/share?url=${e(url)}&text=${e(text)}`;
    case 'telegram': return `https://t.me/share/url?url=${e(url)}&text=${e(text)}`;
    default: return null;
  }
}

/** Hashtags per platform: 小红书 and Instagram live on them; X and Threads take a few; chat apps none. */
export function hashtags(p: Platform | 'native', tags: string[]): string {
  const base = ['TCG', '卡牌', '日日新卡市', ...tags.map((t) => t.replace(/[\s#·]+/g, ''))].filter(Boolean);
  const n = p === 'instagram' || p === 'xiaohongshu' ? 8 : p === 'x' || p === 'threads' || p === 'weibo' ? 3 : 0;
  return [...new Set(base)].slice(0, n).map((t) => `#${t}`).join(' ');
}
