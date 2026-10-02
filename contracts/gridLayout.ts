/**
 * 格仔牆佈局（前後端共用）——v2 規格：
 * 10 排 × 每排 7 格 = 70 格，編號 001–070（001–007 第 1 排 … 064–070 第 10 排）。
 * 大格：第 2–10 排嘅第 3、4 格（010、011、017、018 … 066、067，共 18 格）；其餘係中格。
 * 中格 $500/月，大格統一 $700/月。
 */
export const GRID_ROW_COUNT = 10;
export const GRIDS_PER_ROW = 7;
export const GRID_TOTAL = GRID_ROW_COUNT * GRIDS_PER_ROW;
/** 大格所在格位（1-based，由左到右）同排數（1-based，由上到下） */
export const LARGE_COL_NUMS: ReadonlySet<number> = new Set([3, 4]);
export const LARGE_ROW_RANGE = { from: 2, to: 10 } as const;

export const GRID_RENT = { M: 500, L: 700 } as const;
export type GridSize = keyof typeof GRID_RENT;

/** 格仔編號 → 排數（001–007 為第 1 排） */
export function gridRowOf(code: string): number {
  const n = parseInt(code, 10);
  if (!Number.isFinite(n)) return 0;
  return Math.floor((n - 1) / GRIDS_PER_ROW) + 1;
}

/** 格仔編號 → 該排第幾格（1–7） */
export function gridColOf(code: string): number {
  const n = parseInt(code, 10);
  if (!Number.isFinite(n)) return 0;
  return ((n - 1) % GRIDS_PER_ROW) + 1;
}

export function gridSizeOf(code: string): GridSize {
  const row = gridRowOf(code);
  const large = row >= LARGE_ROW_RANGE.from && row <= LARGE_ROW_RANGE.to && LARGE_COL_NUMS.has(gridColOf(code));
  return large ? "L" : "M";
}

export function gridRentOf(code: string): number {
  return GRID_RENT[gridSizeOf(code)];
}

/** 全部 70 個格仔編號，由上到下、由左到右（001…070） */
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
