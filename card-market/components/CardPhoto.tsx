'use client';
import { useState } from 'react';
import { glyph, photoUrl } from '@/lib/cards';
import type { Category, PhotoSide } from '@/lib/types';

/** A card photo at trading-card proportions (63 × 88 mm), or a category placeholder. */
export function CardPhoto({ cardId, side = 'FRONT', has, version, category, name, className = '' }: {
  cardId: string | null; side?: PhotoSide; has: boolean; version?: number; category?: Category | null; name: string; className?: string;
}) {
  const [broken, setBroken] = useState(false);
  const show = has && cardId && !broken;
  return (
    <div className={`relative aspect-[63/88] overflow-hidden rounded-xl bg-surface-2 ${className}`}>
      {show ? (
        // Plain <img>: a private photo served by the cookie-authenticated proxy, not a static asset.
        <img src={photoUrl(cardId, side, version)} alt={name} loading="lazy" onError={() => setBroken(true)} className="size-full object-cover" />
      ) : (
        <div className="grid size-full place-items-center" style={{ background: category ? `${category.color}22` : undefined }}>
          <span className="text-4xl" aria-hidden>{glyph(category?.glyph)}</span>
        </div>
      )}
    </div>
  );
}
