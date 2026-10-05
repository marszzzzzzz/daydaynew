/**
 * 考勤機匯出嘅「員工考勤_明細」CSV 解析（前後端共用，純函數）。
 *
 * 檔案格式（UTF-8，可能有 BOM / CRLF）：
 *   Day Day New    員工考勤_明細-日期 2026-09-01 10-00-00至2026-10-01 10-00-00
 *   員工考勤_明細  共 6 條記錄
 *   行號,員工,上班次數,工時,早到次數,遲到次數,早退次數,加班次數,查看詳細
 *   1,107-Angel,3\t,24:07:13,0,0,0,0,查看詳細
 *   …
 *   合計,-,26\t,208:42:58,0,0,0,0,-
 *
 * - 「員工」= 工號-名（例如 107-Angel）；工號用嚟對應系統入面嘅員工
 * - 「工時」= 時:分:秒，可以超過 24 小時
 * - 「合計」行用嚟核對：逐行加埋要等於合計，唔啱就唔准匯入
 * - 日期範圍嘅開始日決定月份（例如 2026-09-01 10:00 至 2026-10-01 10:00 → 2026-09）
 * - 只計整個鐘頭：工時向下取整（24:07:13 → 24 小時），唔足一個鐘嘅分鐘唔計錢
 */

export type AttendanceRow = {
  /** CSV 行號（「行號」欄） */
  line: number;
  /** 工號，例如 "107"；冇工號就係 "" */
  code: string;
  name: string;
  shiftCount: number;
  /** 總工作秒數 */
  seconds: number;
  /** 計薪工時（整數小時，向下取整） */
  hours: number;
};

export type ParsedAttendance = {
  /** YYYY-MM-DD（檔頭日期範圍；搵唔到就 null） */
  periodFrom: string | null;
  periodTo: string | null;
  /** 由 periodFrom 推算嘅月份 YYYY-MM */
  month: string | null;
  rows: AttendanceRow[];
  total: { shiftCount: number; seconds: number } | null;
  /** 有任何錯誤都唔准匯入 */
  errors: string[];
};

/** "24:07:13" → 86833；"8:10" 亦接受（當冇秒） */
export function durationToSeconds(s: string): number | null {
  const m = s.trim().match(/^(\d+):([0-5]\d)(?::([0-5]\d))?$/);
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] ?? 0);
}

/** 計薪工時：只計整個鐘頭（向下取整） */
export function secondsToHours(sec: number): number {
  return Math.floor(sec / 3600);
}

/** 86833 → "24:07:13" */
export function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** 簡單 CSV 分欄（支援雙引號） */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((v) => v.replace(/\t/g, "").trim());
}

/** "107-Angel" → { code: "107", name: "Angel" }；"Angel" → { code: "", name: "Angel" } */
export function splitStaff(s: string): { code: string; name: string } {
  const m = s.trim().match(/^(\d+)\s*-\s*(.+)$/);
  return m ? { code: m[1], name: m[2].trim() } : { code: "", name: s.trim() };
}

export function parseAttendanceCsv(text: string): ParsedAttendance {
  const errors: string[] = [];
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);

  // 日期範圍：檔頭或者檔名格式「2026-09-01 10-00-00至2026-10-01 10-00-00」
  const period = text.match(/(\d{4}-\d{2}-\d{2})[^至\n]*至\s*(\d{4}-\d{2}-\d{2})/);
  const periodFrom = period?.[1] ?? null;
  const periodTo = period?.[2] ?? null;

  const headerIdx = lines.findIndex((l) => /員工/.test(l) && /工時/.test(l) && l.includes(","));
  if (headerIdx < 0) {
    return { periodFrom, periodTo, month: periodFrom?.slice(0, 7) ?? null, rows: [], total: null, errors: ["搵唔到標題行（要有「員工」同「工時」欄）。請確認係考勤機匯出嘅「員工考勤_明細」CSV"] };
  }
  const head = splitCsvLine(lines[headerIdx]);
  const col = (re: RegExp) => head.findIndex((h) => re.test(h));
  const cLine = col(/^行號$/);
  const cStaff = col(/^員工$/);
  const cCount = col(/上班次數/);
  const cHours = col(/^工時$/);
  if (cStaff < 0 || cHours < 0) errors.push("標題行缺少「員工」或「工時」欄");

  const rows: AttendanceRow[] = [];
  let total: ParsedAttendance["total"] = null;
  const seen = new Map<string, number>();

  for (let i = headerIdx + 1; i < lines.length && cStaff >= 0 && cHours >= 0; i++) {
    const raw = lines[i];
    if (!raw.trim()) continue;
    const f = splitCsvLine(raw);
    const lineNo = cLine >= 0 ? f[cLine] : String(rows.length + 1);
    const seconds = durationToSeconds(f[cHours] ?? "");
    const count = cCount >= 0 ? Number(f[cCount] || 0) : 0;

    if (/^合計$/.test(lineNo) || /^合計$/.test(f[0] ?? "")) {
      if (seconds === null) errors.push(`合計行工時格式錯誤：「${f[cHours]}」`);
      else total = { shiftCount: count, seconds };
      continue;
    }
    const staff = splitStaff(f[cStaff] ?? "");
    const where = `第 ${lineNo} 行（${f[cStaff] || "冇名"}）`;
    if (!staff.name) {
      errors.push(`${where}：冇員工名`);
      continue;
    }
    if (seconds === null) {
      errors.push(`${where}：工時格式錯誤「${f[cHours]}」，應該係 時:分:秒`);
      continue;
    }
    if (!Number.isInteger(count) || count < 0) {
      errors.push(`${where}：上班次數錯誤「${f[cCount]}」`);
      continue;
    }
    const key = staff.code || staff.name.toLowerCase();
    if (seen.has(key)) {
      errors.push(`${where}：同第 ${seen.get(key)} 行係同一位員工，重複咗`);
      continue;
    }
    seen.set(key, Number(lineNo) || rows.length + 1);
    rows.push({ line: Number(lineNo) || rows.length + 1, ...staff, shiftCount: count, seconds, hours: secondsToHours(seconds) });
  }

  if (rows.length === 0 && errors.length === 0) errors.push("CSV 入面冇任何員工記錄");
  if (total && errors.length === 0) {
    const s = rows.reduce((a, r) => a + r.seconds, 0);
    const c = rows.reduce((a, r) => a + r.shiftCount, 0);
    if (s !== total.seconds) errors.push(`工時合計對唔上：逐行加埋 ${formatDuration(s)}，但檔案合計係 ${formatDuration(total.seconds)}`);
    if (cCount >= 0 && c !== total.shiftCount) errors.push(`上班次數合計對唔上：逐行加埋 ${c}，但檔案合計係 ${total.shiftCount}`);
  }

  return { periodFrom, periodTo, month: periodFrom?.slice(0, 7) ?? null, rows, total, errors };
}
