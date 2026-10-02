/**
 * 格仔牆佈局（前後端共用）：
 * 7 層（橫）× 10 行（直）= 70 格，編號 001–070，由上到下、再由左到右：
 * 第 1 直行 = 001–007，第 2 直行 = 008–014 … 第 10 直行 = 064–070。
 * 大格：第 3、4 層（當眼位置）嘅第 2–10 直行 → 010、011、017、018 … 066、067，共 18 格；其餘係中格。
 * 中格 $500/月，大格統一 $700/月。
 */
/** 每一直行有幾多層（由上到下） */
export const GRID_SHELVES = 7;
/** 幾多直行（由左到右） */
export const GRID_COLUMNS = 10;
export const GRID_TOTAL = GRID_SHELVES * GRID_COLUMNS;
/** 大格所在層數（1-based，由上到下）同直行範圍（1-based，由左到右） */
export const LARGE_SHELVES: ReadonlySet<number> = new Set([3, 4]);
export const LARGE_COLUMN_RANGE = { from: 2, to: 10 } as const;

export const GRID_RENT = { M: 500, L: 700 } as const;
export type GridSize = keyof typeof GRID_RENT;

/** 格仔編號 → 第幾直行（1–10，由左到右） */
export function gridColumnOf(code: string): number {
  const n = parseInt(code, 10);
  if (!Number.isFinite(n)) return 0;
  return Math.floor((n - 1) / GRID_SHELVES) + 1;
}

/** 格仔編號 → 第幾層（1–7，由上到下） */
export function gridShelfOf(code: string): number {
  const n = parseInt(code, 10);
  if (!Number.isFinite(n)) return 0;
  return ((n - 1) % GRID_SHELVES) + 1;
}

export function gridSizeOf(code: string): GridSize {
  const col = gridColumnOf(code);
  const large = LARGE_SHELVES.has(gridShelfOf(code)) && col >= LARGE_COLUMN_RANGE.from && col <= LARGE_COLUMN_RANGE.to;
  return large ? "L" : "M";
}

export function gridRentOf(code: string): number {
  return GRID_RENT[gridSizeOf(code)];
}

/** 全部 70 個格仔編號（001…070） */
export function allGridCodes(): string[] {
  const codes: string[] = [];
  for (let i = 1; i <= GRID_TOTAL; i++) {
    codes.push(String(i).padStart(3, "0"));
  }
  return codes;
}

/** 合法性格仔編號（001–070） */
export function isValidGridCode(code: string): boolean {
  if (!/^\d{1,3}$/.test(code)) return false;
  const n = parseInt(code, 10);
  return n >= 1 && n <= GRID_TOTAL;
}

/** 統一格仔編號格式：24 / 024 → 024 */
export function normalizeGridCode(code: string): string {
  const n = parseInt(code.trim(), 10);
  if (!Number.isFinite(n)) return code.trim();
  return String(n).padStart(3, "0");
}
