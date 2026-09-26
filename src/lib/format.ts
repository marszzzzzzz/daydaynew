export function fmtMoney(v: string | number | null | undefined): string {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return "0.00";
  return n.toLocaleString("en-HK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function currentMonthStr(): string {
  return todayStr().slice(0, 7);
}

export const GRID_STATUS_LABEL: Record<string, string> = {
  vacant: "招租中",
  occupied: "已租出",
  reserved: "已預留",
};

export const GRID_SIZE_LABEL: Record<string, string> = {
  M: "中格",
  L: "大格",
};
