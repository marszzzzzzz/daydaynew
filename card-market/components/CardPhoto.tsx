'use client';
import { useState } from 'react';
import { glyph, photoUrl } from '@/lib/cards';
import type { Category, PhotoSide } from '@/lib/types';

/** A card photo at trading-card proportions (63 × 88 mm), or a category placeholder. */
export function CardPhoto({ cardId, side = 'FRONT', has, version, category, name, className = '' }: {
  cardId: string | null; side?: PhotoSide; has: boolean; version?: number; category?: Category | null; name: string; className?: string;
}) {
  const src = has && cardId ? photoUrl(cardId, side, version) : null;
  const [broken, setBroken] = useState<string | null>(null); // the src that failed, so another side/version still tries
  const show = src !== null && broken !== src;
  return (
    <div className={`relative aspect-[63/88] overflow-hidden rounded-xl bg-surface-2 ${className}`}>
      {show ? (
        // Plain <img>: a private photo served by the cookie-authenticated proxy, not a static asset.
        <img src={src} alt={name} loading="lazy" onError={() => setBroken(src)} className="size-full object-cover" />
      ) : (
        <div className="grid size-full place-items-center" style={{ background: category ? `${category.color}22` : undefined }}>
          <span className="text-4xl" aria-hidden>{glyph(category?.glyph)}</span>
        </div>
      )}
    </div>
  );
}
