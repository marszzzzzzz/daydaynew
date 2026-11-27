'use client';
import { useState } from 'react';
import { photoUrl } from '@/lib/cards';
import type { Category, PhotoSide } from '@/lib/types';

/** A card photo at trading-card proportions (63 × 88 mm), or a category placeholder. */
/** `thumb`: a copy about this many pixels wide instead of the full photo (for small tiles). */
export function CardPhoto({ cardId, side = 'FRONT', has, version, category, name, className = '', thumb }: {
  cardId: string | null; side?: PhotoSide; has: boolean; version?: number; category?: Category | null; name: string; className?: string; thumb?: 240 | 360 | 480;
}) {
  const src = has && cardId ? photoUrl(cardId, side, version, thumb) : null;
  const [broken, setBroken] = useState<string | null>(null); // the src that failed, so another side/version still tries
  const show = src !== null && broken !== src;
  return (
    <div className={`relative aspect-[63/88] overflow-hidden acrylic rounded-sm bg-surface-2 ${className}`}>
      {show ? (
        // Plain <img>: a private photo served by the cookie-authenticated proxy, not a static asset.
        <img src={src} alt={name} loading="lazy" decoding="async" onError={() => setBroken(src)} className="size-full object-cover" />
      ) : (
        // No photo: an empty slot in the case, edged in the category's colour.
        <div className="grid size-full place-items-center p-3 text-center" style={{ boxShadow: category ? `inset 0 -3px 0 ${category.color}` : undefined }}>
          <span className="display text-xs text-muted" aria-hidden>{category?.name ?? ''}</span>
        </div>
      )}
    </div>
  );
}
