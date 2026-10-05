import { describe, expect, it } from "vitest";
import { durationToSeconds, parseAttendanceCsv, splitStaff } from "./attendance";

// 同考勤機原檔一樣：UTF-8 BOM、CRLF、上班次數後面有 tab
const REAL = [
  "﻿Day Day New    員工考勤_明細-日期 2026-09-01 10-00-00至2026-10-01 10-00-00",
  "員工考勤_明細  共 6 條記錄",
  "行號,員工,上班次數,工時,早到次數,遲到次數,早退次數,加班次數,查看詳細",
  "1,107-Angel,3\t,24:07:13,0,0,0,0,查看詳細",
  "2,105-Yanki ,2\t,15:52:39,0,0,0,0,查看詳細",
  "3,106-Leni,1\t,08:10:35,0,0,0,0,查看詳細",
  "4,102-Eva,4\t,32:47:52,0,0,0,0,查看詳細",
  "5,108-Ayesha,7\t,55:40:39,0,0,0,0,查看詳細",
  "6,110-Esme ,9\t,72:04:00,0,0,0,0,查看詳細",
  "合計,-,26\t,208:42:58,0,0,0,0,-",
  "",
].join("\r\n");

describe("parseAttendanceCsv", () => {
  it("讀到真實考勤檔", () => {
    const p = parseAttendanceCsv(REAL);
    expect(p.errors).toEqual([]);
    expect(p.month).toBe("2026-09");
    expect(p.periodFrom).toBe("2026-09-01");
    expect(p.periodTo).toBe("2026-10-01");
    expect(p.rows).toHaveLength(6);
    expect(p.rows[0]).toEqual({ line: 1, code: "107", name: "Angel", shiftCount: 3, seconds: 24 * 3600 + 7 * 60 + 13, hours: 24 });
    expect(p.rows[1].name).toBe("Yanki");
    expect(p.rows[5]).toMatchObject({ code: "110", name: "Esme", shiftCount: 9, hours: 72 });
    // 只計整個鐘頭：24+15+8+32+55+72
    expect(p.rows.reduce((a, r) => a + r.hours, 0)).toBe(206);
    expect(p.total).toEqual({ shiftCount: 26, seconds: 208 * 3600 + 42 * 60 + 58 });
  });
  it("合計對唔上 → 錯誤", () => {
    const p = parseAttendanceCsv(REAL.replace("24:07:13", "25:07:13"));
    expect(p.errors.join()).toMatch(/工時合計對唔上/);
  });
  it("工時格式錯 → 錯誤", () => {
    expect(parseAttendanceCsv(REAL.replace("08:10:35", "8小時")).errors.join()).toMatch(/第 3 行.*工時格式錯誤/);
  });
  it("重複員工 → 錯誤", () => {
    expect(parseAttendanceCsv(REAL.replace("106-Leni", "107-Angel")).errors.join()).toMatch(/重複/);
  });
  it("唔係考勤檔 → 錯誤", () => {
    expect(parseAttendanceCsv("行號,商品名稱,數量\n1,杯,2").errors[0]).toMatch(/搵唔到標題行/);
  });
});

describe("helpers", () => {
  it("durationToSeconds", () => {
    expect(durationToSeconds("208:42:58")).toBe(751378);
    expect(durationToSeconds("8:10")).toBe(29400);
    expect(durationToSeconds("abc")).toBeNull();
  });
  it("splitStaff", () => {
    expect(splitStaff("105-Yanki ")).toEqual({ code: "105", name: "Yanki" });
    expect(splitStaff("陳大文")).toEqual({ code: "", name: "陳大文" });
  });
});
