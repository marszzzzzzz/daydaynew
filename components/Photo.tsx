'use client';
import { useState } from 'react';
import type { PhotoSide } from '@/lib/types';

export const photoUrl = (id: string, side: PhotoSide, v?: number) => `/api/contacts/${encodeURIComponent(id)}/photos/${side.toLowerCase()}${v ? `?v=${v}` : ''}`;

/** A saved card photo through the authenticated proxy (plain <img>: the session cookie authorises it). */
export function CardPhoto({ id, side, v, className = '', alt = '' }: { id: string; side: PhotoSide; v?: number; className?: string; alt?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <div className={`grid place-items-center bg-surface-2 text-2xl ${className}`}>📇</div>;
  return <img src={photoUrl(id, side, v)} alt={alt} loading="lazy" onError={() => setFailed(true)} className={`object-cover ${className}`} />;
}

/** Front/back with a tap to flip, and a tap-and-hold-free "open full size" link. */
export function FlipPhoto({ id, sides, v }: { id: string; sides: PhotoSide[]; v?: number }) {
  const [side, setSide] = useState<PhotoSide>(sides.includes('FRONT') ? 'FRONT' : 'BACK');
  if (!sides.length) return null;
  return (
    <div>
      <button type="button" onClick={() => sides.length > 1 && setSide(side === 'FRONT' ? 'BACK' : 'FRONT')} className="block w-full overflow-hidden rounded-2xl border border-line bg-surface-2">
        <CardPhoto id={id} side={side} v={v} className="aspect-[90/54] w-full" />
      </button>
      <div className="mt-2 flex items-center justify-between text-xs text-muted">
        <span>{sides.length > 1 ? (side === 'FRONT' ? '① / ②' : '② / ①') : ''}</span>
        <a href={photoUrl(id, side, v)} target="_blank" rel="noreferrer" className="underline">↗</a>
      </div>
    </div>
  );
}
