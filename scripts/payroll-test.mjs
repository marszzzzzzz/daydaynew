// 兼職人工 API 端到端測試（要喺空資料庫、以 OWNER_USERNAME=boss OWNER_PASSWORD=BossPass!2026 啟動嘅 server 行）：node scripts/payroll-test.mjs
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
const a = await boss("payroll.createEmployee", { name: "阿明", hourlyRate: 60, mpfEnrolled: true });
const b = await boss("payroll.createEmployee", { name: "阿珍", hourlyRate: 50, mpfEnrolled: false });
ck("新增 2 位員工", a.id && b.id, [a, b]);
// 阿明：17 更 10-18 休息 1 小時 + 1 更 10-14 = 123 小時 × 60 = 7380
for (let d = 1; d <= 17; d++) await boss("payroll.createShift", { employeeId: a.id, workDate: `2026-09-${String(d).padStart(2, "0")}`, startTime: "10:00", endTime: "18:00", breakMinutes: 60 });
await boss("payroll.createShift", { employeeId: a.id, workDate: "2026-09-20", startTime: "10:00", endTime: "14:00", breakMinutes: 0 });
// 阿珍：跨午夜 22:00-02:00 = 4 小時 × 50 = 200；另一更自訂時薪 70 × 3 = 210
await boss("payroll.createShift", { employeeId: b.id, workDate: "2026-09-05", startTime: "22:00", endTime: "02:00", breakMinutes: 0 });
await boss("payroll.createShift", { employeeId: b.id, workDate: "2026-09-06", startTime: "12:00", endTime: "15:00", breakMinutes: 0, hourlyRate: 70 });
let s = await boss("payroll.monthSummary", { month: "2026-09" }, true);
const ra = s.rows.find((r) => r.name === "阿明"), rb = s.rows.find((r) => r.name === "阿珍");
ck("阿明：123 小時、$7,380、僱員僱主強積金各 $369、實收 $7,011", ra.hours === 123 && ra.gross === 7380 && ra.mpfEmployee === 369 && ra.mpfEmployer === 369 && ra.net === 7011, ra);
ck("阿珍：跨午夜 + 自訂時薪 = 7 小時 $410，冇強積金", rb.hours === 7 && rb.gross === 410 && rb.mpfEmployer === 0 && rb.net === 410, rb);
ck("總成本 = 總人工 + 僱主強積金", s.totals.employerCost === 7380 + 410 + 369, s.totals);
// 加人工唔影響舊更
await boss("payroll.updateEmployee", { id: a.id, hourlyRate: 65 });
s = await boss("payroll.monthSummary", { month: "2026-09" }, true);
ck("改時薪後舊更人工不變", s.rows.find((r) => r.name === "阿明").gross === 7380, s.rows);
// 出糧 + 調整
const paid = await boss("payroll.markPaid", { employeeId: a.id, month: "2026-09", paidAt: "2026-10-07", adjustment: 300, note: "中秋假期" });
ck("出糧連調整 +300：總人工 $7,680、僱員強積金 $384", paid.gross === 7680 && paid.mpfEmployee === 384 && paid.net === 7296, paid);
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
console.log(`  → ${pass} 通過 / ${fail} 失敗`);
