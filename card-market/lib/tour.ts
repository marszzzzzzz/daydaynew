// Which guided tours a viewer has finished. Kept in this browser only (a per-viewer convenience): a
// private window or cleared storage just shows the tours again.
const KEY = 'cm_tour_v1_';
export type TourId = 'home' | 'camera' | 'review' | 'firstSave' | 'checklist';
const IDS: TourId[] = ['home', 'camera', 'review', 'firstSave', 'checklist'];

export function seen(id: TourId): boolean {
  try { return localStorage.getItem(KEY + id) === '1'; } catch { return false; }
}
export function markSeen(id: TourId) {
  try { localStorage.setItem(KEY + id, '1'); } catch { /* private mode: shown again next time */ }
}
/** "Show the guide again": every tour and the starter checklist come back. */
export function resetTours() {
  try { for (const id of IDS) localStorage.removeItem(KEY + id); } catch { /* nothing stored */ }
}
