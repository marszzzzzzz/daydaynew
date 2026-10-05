// 兼職人工 API 端到端測試（要喺空資料庫、以 OWNER_USERNAME=boss OWNER_PASSWORD=BossPass!2026 啟動嘅 server 行）：node scripts/payroll-test.mjs
// 考勤匯入部分會讀 ~/2026ai/員工考勤_明細-*.csv（考勤機原檔）
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const B = "http://localhost:3200/api/trpc/";
let pass = 0, fail = 0;
const ck = (l, c, d) => { c ? pass++ : fail++; console.log(`  ${c ? "✓" : "✗"} ${l}${c ? "" : "  → " + JSON.stringify(d).slice(0, 250)}`); };
function client() {
  let cookie = "";
  return async (p, input, get) => {
    const url = B + p + (get ? `?input=${encodeURIComponent(JSON.stringify({ json: input }))}` : "");
    const r = await fetch(url, { method: get ? "GET" : "POST", headers: { "content-type": "application/json", cookie }, body: get ? undefined : JSON.stringify({ json: input ?? null }) });
    for (const c of r.headers.getSetCookie()) if (c.startsWith("gridbox_sid=")) cookie = c.split(";")[0];
    const j = await r.json();
    return j.error ? { err: j.error.json.message, code: j.error.json.data?.code } : j.result.data.json;
  };
}
const boss = client();
await boss("account.login", { username: "boss", password: "BossPass!2026" });
const a = await boss("payroll.createEmployee", { name: "阿明", hourlyRate: 60 });
const b = await boss("payroll.createEmployee", { name: "阿珍", hourlyRate: 50 });
ck("新增 2 位員工", a.id && b.id, [a, b]);
// 阿明：17 更 10-18 休息 1 小時 + 1 更 10-14 = 123 小時 × 60 = 7380
for (let d = 1; d <= 17; d++) await boss("payroll.createShift", { employeeId: a.id, workDate: `2026-09-${String(d).padStart(2, "0")}`, startTime: "10:00", endTime: "18:00", breakMinutes: 60 });
await boss("payroll.createShift", { employeeId: a.id, workDate: "2026-09-20", startTime: "10:00", endTime: "14:00", breakMinutes: 0 });
// 阿珍：跨午夜 22:00-02:00 = 4 小時 × 50 = 200；另一更自訂時薪 70 × 3 = 210
await boss("payroll.createShift", { employeeId: b.id, workDate: "2026-09-05", startTime: "22:00", endTime: "02:00", breakMinutes: 0 });
await boss("payroll.createShift", { employeeId: b.id, workDate: "2026-09-06", startTime: "12:00", endTime: "15:00", breakMinutes: 0, hourlyRate: 70 });
let s = await boss("payroll.monthSummary", { month: "2026-09" }, true);
const ra = s.rows.find((r) => r.name === "阿明"), rb = s.rows.find((r) => r.name === "阿珍");
ck("阿明：123 小時、$7,380（冇強積金欄）", ra.hours === 123 && ra.gross === 7380 && !("mpfEmployee" in ra) && !("net" in ra), ra);
ck("阿珍：跨午夜 + 自訂時薪 = 7 小時 $410", rb.hours === 7 && rb.gross === 410, rb);
ck("總人工 = $7,790", s.totals.gross === 7380 + 410 && !("employerCost" in s.totals), s.totals);
// 加人工唔影響舊更
await boss("payroll.updateEmployee", { id: a.id, hourlyRate: 65 });
s = await boss("payroll.monthSummary", { month: "2026-09" }, true);
ck("改時薪後舊更人工不變", s.rows.find((r) => r.name === "阿明").gross === 7380, s.rows);
// 出糧 + 調整
const paid = await boss("payroll.markPaid", { employeeId: a.id, month: "2026-09", paidAt: "2026-10-07", adjustment: 300, note: "中秋假期" });
ck("出糧連調整 +300：人工 $7,680（唔扣強積金）", paid.gross === 7680 && paid.base === 7380 && !("mpfEmployee" in paid), paid);
const dup = await boss("payroll.markPaid", { employeeId: a.id, month: "2026-09", paidAt: "2026-10-07" });
ck("同月唔可以出兩次糧", dup.err && /已經出咗糧/.test(dup.err), dup);
const locked = await boss("payroll.createShift", { employeeId: a.id, workDate: "2026-09-25", startTime: "10:00", endTime: "12:00" });
ck("出糧後該月唔可以加更", locked.err && /鎖定/.test(locked.err), locked);
const shiftsA = await boss("payroll.listShifts", { month: "2026-09", employeeId: a.id }, true);
const delLocked = await boss("payroll.deleteShift", { id: shiftsA[0].id });
ck("出糧後該月唔可以刪更", delLocked.err && /鎖定/.test(delLocked.err), delLocked);
const oct = await boss("payroll.createShift", { employeeId: a.id, workDate: "2026-10-01", startTime: "10:00", endTime: "12:00" });
ck("下個月照加得，用新時薪 $65", oct.id && (await boss("payroll.listShifts", { month: "2026-10" }, true))[0].hourlyRate === "65.00", oct);
s = await boss("payroll.monthSummary", { month: "2026-09" }, true);
ck("已出糧數字凍結（顯示 $7,680 唔係重新計）", s.rows.find((r) => r.name === "阿明").paid && s.rows.find((r) => r.name === "阿明").gross === 7680, s.rows);
await boss("payroll.unmarkPaid", { employeeId: a.id, month: "2026-09" });
const unlocked = await boss("payroll.createShift", { employeeId: a.id, workDate: "2026-09-25", startTime: "10:00", endTime: "12:00" });
ck("取消出糧後解鎖", unlocked.id, unlocked);
const delEmp = await boss("payroll.deleteEmployee", { id: a.id });
ck("有返工記錄嘅員工唔可以刪", delEmp.err && /停用/.test(delEmp.err), delEmp);
const bad = await boss("payroll.createShift", { employeeId: b.id, workDate: "2026-09-07", startTime: "10:00", endTime: "10:00" });
ck("返工落更同時間 → 拒絕", bad.err, bad);
// 權限
await boss("account.createAccount", { username: "staff1", password: "staff123", name: "店員", role: "staff" });
const staff = client();
await staff("account.login", { username: "staff1", password: "staff123" });
const st = await staff("payroll.monthSummary", { month: "2026-09" }, true);
ck("店員睇唔到人工 → FORBIDDEN", st.code === "FORBIDDEN", st);
const anon = await client()("payroll.listEmployees", undefined, true);
ck("未登入 → UNAUTHORIZED", anon.code === "UNAUTHORIZED", anon);

// ─── 考勤機 CSV 匯入 ───────────────────────────────
const dir = path.join(os.homedir(), "2026ai");
const file = fs.readdirSync(dir).find((f) => f.startsWith("員工考勤_明細") && f.endsWith(".csv"));
const csv = fs.readFileSync(path.join(dir, file), "utf8");
// 預先有一位按名對應嘅員工（冇工號）→ 匯入後應該記低工號 102
const eva = await boss("payroll.createEmployee", { name: "eva", hourlyRate: 55 });
let pv = await boss("payroll.importAttendance", { csvText: csv, dryRun: true });
ck("預覽：讀到 6 人、月份 2026-09、總工時 208.72", pv.rows?.length === 6 && pv.month === "2026-09" && Math.abs(pv.total.hours - 208.72) < 0.02, pv.err ?? pv.total);
const pvEva = pv.rows?.find((r) => r.code === "102");
ck("Eva 按名對應到現有員工，用佢 $55 時薪", pvEva?.employeeId === eva.id && pvEva.matchedBy === "name" && pvEva.pay === Math.round(32.8 * 55 * 100) / 100, pvEva);
ck("其餘 5 位係新員工", pv.rows?.filter((r) => r.status === "new").length === 5, pv.rows?.map((r) => r.status));
let noRate = await boss("payroll.importAttendance", { csvText: csv, dryRun: false });
ck("新員工冇時薪 → 唔准匯入", noRate.err && /時薪/.test(noRate.err), noRate);
const rates = Object.fromEntries(pv.rows.filter((r) => r.status === "new").map((r) => [r.key, 60]));
let im = await boss("payroll.importAttendance", { csvText: csv, newRates: rates, dryRun: false });
ck("正式匯入：6 位、新增 5 位員工", im.imported === 6 && im.created === 5, im.err ?? im);
let att = await boss("payroll.listAttendance", { month: "2026-09" }, true);
const angel = att.find((x) => x.staffCode === "107");
ck("Angel 107：3 次、24.12 小時 × $60 = $1,447.20", angel && angel.shiftCount === 3 && Number(angel.hours) === 24.12 && angel.pay === 1447.2, angel);
const emps = await boss("payroll.listEmployees", undefined, true);
ck("Eva 自動記低工號 102", emps.find((e) => e.id === eva.id)?.staffCode === "102", emps.find((e) => e.id === eva.id));
s = await boss("payroll.monthSummary", { month: "2026-09" }, true);
const sAngel = s.rows.find((r) => r.staffCode === "107");
ck("月結包含考勤人工", sAngel?.hours === 24.12 && sAngel.gross === 1447.2 && sAngel.shifts === 3, sAngel);
// 再匯入同一個檔 → 覆蓋，唔會重複
await boss("payroll.updateEmployee", { id: angel.employeeId, hourlyRate: 70 });
pv = await boss("payroll.importAttendance", { csvText: csv, dryRun: true });
ck("再匯入預覽：全部係「覆蓋」、冇新員工", pv.rows.every((r) => r.status === "replace"), pv.rows.map((r) => r.status));
im = await boss("payroll.importAttendance", { csvText: csv, dryRun: false });
att = await boss("payroll.listAttendance", { month: "2026-09" }, true);
ck("覆蓋後仍然 6 條，Angel 用新時薪 $70", att.length === 6 && att.find((x) => x.staffCode === "107").pay === Math.round(24.12 * 70 * 100) / 100, att.map((x) => [x.staffCode, x.pay]));
// 出糧後鎖定
const sEva = s.rows.find((r) => r.employeeId === eva.id);
await boss("payroll.markPaid", { employeeId: eva.id, month: "2026-09", paidAt: "2026-10-07" });
pv = await boss("payroll.importAttendance", { csvText: csv, dryRun: true });
ck("已出糧員工再匯入 → 跳過", pv.rows.find((r) => r.code === "102").status === "locked", pv.rows.find((r) => r.code === "102"));
const evaAtt = att.find((x) => x.employeeId === eva.id);
const delLockedAtt = await boss("payroll.deleteAttendance", { id: evaAtt.id });
ck("已出糧員工嘅考勤唔可以刪", delLockedAtt.err && /鎖定/.test(delLockedAtt.err), delLockedAtt);
ck("出糧金額 = 考勤人工", sEva && (await boss("payroll.monthSummary", { month: "2026-09" }, true)).rows.find((r) => r.employeeId === eva.id).gross === sEva.gross, sEva);
const dupCode = await boss("payroll.createEmployee", { name: "冒牌", staffCode: "107", hourlyRate: 50 });
ck("工號唔可以重複", dupCode.err && /工號 107/.test(dupCode.err), dupCode);
const badCsv = await boss("payroll.importAttendance", { csvText: csv.replace("24:07:13", "25:07:13"), dryRun: true });
ck("合計對唔上 → 拒絕", badCsv.err && /合計對唔上/.test(badCsv.err), badCsv);
const staffImp = await staff("payroll.importAttendance", { csvText: csv, dryRun: true });
ck("店員唔可以匯入考勤", staffImp.code === "FORBIDDEN", staffImp);

console.log(`  → ${pass} 通過 / ${fail} 失敗`);
