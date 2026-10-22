/** 導覽聚光燈同說明卡嘅位置計算（純函數，方便測試） */

export type Rect = { top: number; left: number; width: number; height: number };
export type Size = { width: number; height: number };
export type CardPlacement = { top: number; left: number; side: "bottom" | "top" | "overlay" };

/** 說明卡同目標之間嘅距離 */
export const CARD_GAP = 16;
/** 說明卡同畫面邊嘅最少距離 */
export const VIEWPORT_MARGIN = 12;

export function spotlightRect(target: Rect, padding: number): Rect {
  return {
    top: target.top - padding,
    left: target.left - padding,
    width: target.width + padding * 2,
    height: target.height + padding * 2,
  };
}

const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), Math.max(min, max));

/** 優先放喺目標下面；下面唔夠位就放上面；兩邊都唔夠（目標好高）就貼住畫面底 */
export function placeCard(target: Rect, card: Size, viewport: Size): CardPlacement {
  const left = clamp(target.left + target.width / 2 - card.width / 2, VIEWPORT_MARGIN, viewport.width - card.width - VIEWPORT_MARGIN);
  const below = target.top + target.height + CARD_GAP;
  if (below + card.height <= viewport.height - VIEWPORT_MARGIN) return { top: below, left, side: "bottom" };
  const above = target.top - CARD_GAP - card.height;
  if (above >= VIEWPORT_MARGIN) return { top: above, left, side: "top" };
  return { top: viewport.height - card.height - VIEWPORT_MARGIN, left, side: "overlay" };
}
