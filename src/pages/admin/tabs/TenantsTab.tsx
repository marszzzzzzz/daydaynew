import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { toast } from "sonner";
import { SectionTitle, Field, ActionButton, EmptyRow } from "../ui";

export default function TenantsTab() {
  const utils = trpc.useUtils();
  const tenants = trpc.shop.admin.listTenants.useQuery();
  const users = trpc.shop.admin.listUsers.useQuery();

  const [fName, setFName] = useState("");
  const [fPhone, setFPhone] = useState("");
  const [fEmail, setFEmail] = useState("");
  const [fNote, setFNote] = useState("");

  const invalidate = () => {
    utils.shop.admin.listTenants.invalidate();
    utils.shop.admin.stats.invalidate();
    utils.shop.publicStats.invalidate();
  };

  const create = trpc.shop.admin.createTenant.useMutation({
    onSuccess: () => {
      toast.success("租戶已新增");
      setFName("");
      setFPhone("");
      setFEmail("");
      setFNote("");
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const update = trpc.shop.admin.updateTenant.useMutation({
    onSuccess: () => {
      toast.success("已更新");
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const del = trpc.shop.admin.deleteTenant.useMutation({
    onSuccess: () => {
      toast.success("已刪除");
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  // 開店員／租客戶口
  const [aUser, setAUser] = useState("");
  const [aName, setAName] = useState("");
  const [aPass, setAPass] = useState("");
  const [aRole, setARole] = useState<"staff" | "user">("staff");

  const createAccount = trpc.account.createAccount.useMutation({
    onSuccess: (r) => {
      toast.success(`已開立${r.role === "staff" ? "店員" : "租客"}戶口：${aUser}`);
      setAUser("");
      setAName("");
      setAPass("");
      users.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const resetPw = trpc.account.resetPassword.useMutation({
    onSuccess: () => toast.success("密碼已重設，請將新密碼交俾用戶"),
    onError: (e) => toast.error(e.message),
  });
  const setRole = trpc.account.setUserRole.useMutation({
    onSuccess: () => {
      toast.success("已更新身份");
      users.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const rows = tenants.data ?? [];
  const userList = users.data ?? [];
  const linkedByUserId = new Map(rows.filter((t) => t.userId != null).map((t) => [t.userId as number, t.name]));

  const ROLE_LABEL: Record<string, string> = { admin: "店主 Admin", staff: "店員 Staff", user: "租客" };

  const displayUsername = (unionId: string) => (unionId.startsWith("local:") ? unionId.slice(6) : unionId);
  const fmtDateTime = (d: Date | string) => {
    const x = new Date(d);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  };

  return (
    <div>
      <SectionTitle
        no="06 · Tenants"
        title="租戶管理"
        desc="建立租戶檔案，並連結佢嘅登入戶口 —— 連結後租戶登入就睇到自己嘅銷售記錄。對方須先登入過一次先會出現喺戶口名單。"
      />

      {/* 新增租戶 */}
      <form
        className="grid gap-5 border border-ink/25 p-6 md:grid-cols-[1fr_160px_1fr_1fr_auto] md:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          if (!fName.trim()) return toast.error("請輸入租戶名稱");
          create.mutate({ name: fName.trim(), phone: fPhone || undefined, email: fEmail || undefined, note: fNote || undefined });
        }}
      >
        <Field label="租戶名稱">
          <input className="underline-input" value={fName} onChange={(e) => setFName(e.target.value)} placeholder="陳小彤" />
        </Field>
        <Field label="電話">
          <input className="underline-input font-mono" value={fPhone} onChange={(e) => setFPhone(e.target.value)} placeholder="9123 4567" />
        </Field>
        <Field label="電郵">
          <input className="underline-input" value={fEmail} onChange={(e) => setFEmail(e.target.value)} placeholder="可留空" />
        </Field>
        <Field label="備註">
          <input className="underline-input" value={fNote} onChange={(e) => setFNote(e.target.value)} placeholder="手作飾物" />
        </Field>
        <ActionButton tone="ochre" disabled={create.isPending}>{create.isPending ? "新增中…" : "+ 新增租戶"}</ActionButton>
      </form>

      {/* 列表 */}
      <div className="mt-10 overflow-x-auto">
        <table className="ledger-table w-full min-w-[820px] text-[13.5px]">
          <thead>
            <tr className="text-left">
              <th className="py-3 pr-4">名稱</th>
              <th className="py-3 pr-4">電話</th>
              <th className="py-3 pr-4">電郵</th>
              <th className="py-3 pr-4">連結戶口</th>
              <th className="py-3 pr-4">備註</th>
              <th className="py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} className="transition-colors hover:bg-ochre/10">
                <td className="py-3 pr-4 font-medium">{t.name}</td>
                <td className="py-3 pr-4 font-mono text-[12.5px]">{t.phone ?? "—"}</td>
                <td className="py-3 pr-4 text-[12.5px]">{t.email ?? "—"}</td>
                <td className="py-3 pr-4">
                  <select
                    className="border border-ink/30 bg-transparent px-2 py-1 font-mono text-[11.5px]"
                    value={t.userId ?? ""}
                    onChange={(e) => update.mutate({ id: t.id, userId: e.target.value ? Number(e.target.value) : null })}
                  >
                    <option value="">未連結</option>
                    {userList.map((u) => (
                      <option key={u.id} value={u.id}>
                        {displayUsername(u.unionId)}（{u.name ?? "未命名"}）{u.role === "admin" ? "· 店主" : ""}
                      </option>
                    ))}
                  </select>
                  {t.userId && (
                    <p className="mt-1 font-mono text-[10.5px] text-ink/45">{t.accountName ?? t.accountEmail ?? `#${t.userId}`}</p>
                  )}
                </td>
                <td className="py-3 pr-4 text-ink/55">{t.note ?? ""}</td>
                <td className="py-3 text-right">
                  <button
                    onClick={() => { if (confirm(`確定刪除租戶 ${t.name}？（有租約／銷售／租金記錄嘅租戶唔可以刪除）`)) del.mutate({ id: t.id }); }}
                    className="px-2 py-1 font-mono text-[11.5px] text-red-800/80 underline-offset-2 hover:underline"
                  >
                    刪除
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <EmptyRow colSpan={6} text={tenants.isLoading ? "載入中…" : "未有租戶"} />}
          </tbody>
        </table>
      </div>

      {/* 已登記用戶（後台記錄） */}
      <div className="mt-16">
        <p className="spec-label">Registered accounts</p>
        <h3 className="font-display mb-2 mt-1.5 text-xl font-black tracking-tight">已登記用戶</h3>
        <p className="mb-6 max-w-xl text-[13px] leading-[1.85] text-ink/60">
          三級權限：<b>店主</b>全權（由伺服器設定建立，得一個；公開註冊一律係租客）；<b>店員</b>可以上載銷售數據、修改自己嘅記錄、查看報表；
          <b>租客</b>唯讀，只可以睇自己所屬格仔嘅銷售數據。店主可以喺度直接開店員／租客戶口，或調整現有戶口身份。
        </p>

        {/* 開戶口 */}
        <div className="mb-8 border border-ink/25 p-6">
          <p className="spec-label">開立店員／租客戶口</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Field label="用戶名">
              <input className="underline-input font-mono" value={aUser} onChange={(e) => setAUser(e.target.value)} placeholder="3–32 字符：中英文、數字、_ . -" />
            </Field>
            <Field label="顯示名稱">
              <input className="underline-input" value={aName} onChange={(e) => setAName(e.target.value)} placeholder="店員阿珍" />
            </Field>
            <Field label="密碼">
              <input className="underline-input font-mono" value={aPass} onChange={(e) => setAPass(e.target.value)} placeholder="最少 6 位" />
            </Field>
            <Field label="身份">
              <select
                className="w-full border border-ink/30 bg-cream px-3 py-2.5 font-mono text-[13.5px] outline-none focus:border-ink"
                value={aRole}
                onChange={(e) => setARole(e.target.value as "staff" | "user")}
              >
                <option value="staff">店員 Staff</option>
                <option value="user">租客</option>
              </select>
            </Field>
            <div className="flex items-end">
              <ActionButton
                tone="ochre"
                disabled={createAccount.isPending || !aUser.trim() || !aName.trim() || !aPass}
                onClick={() => createAccount.mutate({ username: aUser.trim(), password: aPass, name: aName.trim(), role: aRole })}
              >
                {createAccount.isPending ? "開立中…" : "開立戶口"}
              </ActionButton>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto border border-ink/25">
          <table className="ledger-table w-full min-w-[720px] text-[13.5px]">
            <thead>
              <tr className="text-left">
                <th className="py-3 pl-5 pr-4">用戶名</th>
                <th className="py-3 pr-4">顯示名稱</th>
                <th className="py-3 pr-4">身份</th>
                <th className="py-3 pr-4">註冊日期</th>
                <th className="py-3 pr-4">最近登入</th>
                <th className="py-3 pr-4">連結嘅租戶</th>
                <th className="py-3 pr-5 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {userList.map((u) => (
                <tr key={u.id} className="transition-colors hover:bg-ochre/10">
                  <td className="py-3 pl-5 pr-4 font-mono text-[12.5px] font-semibold">{displayUsername(u.unionId)}</td>
                  <td className="py-3 pr-4">{u.name ?? "—"}</td>
                  <td className="py-3 pr-4">
                    <span className={`badge-frame border ${u.role === "admin" ? "border-ochre-deep/70 text-ochre-deep" : u.role === "staff" ? "border-ink/70 text-ink" : "border-ink/40 text-ink/60"}`}>
                      {ROLE_LABEL[u.role] ?? u.role}
                    </span>
                  </td>
                  <td className="py-3 pr-4 font-mono text-[12.5px]">{fmtDateTime(u.createdAt)}</td>
                  <td className="py-3 pr-4 font-mono text-[12.5px]">{fmtDateTime(u.lastSignInAt)}</td>
                  <td className="py-3 pr-4 text-[12.5px]">
                    {linkedByUserId.get(u.id) ?? <span className="text-ink/40">未連結</span>}
                  </td>
                  <td className="py-3 pr-5 text-right font-mono text-[11.5px]">
                    {u.role !== "admin" && (
                      <>
                        <button
                          onClick={() => setRole.mutate({ userId: u.id, role: u.role === "staff" ? "user" : "staff" })}
                          className="px-2 py-1 text-ochre-deep underline-offset-2 hover:underline"
                        >
                          {u.role === "staff" ? "降為租客" : "升為店員"}
                        </button>
                        <button
                          onClick={() => {
                            const pw = window.prompt(`為 ${displayUsername(u.unionId)} 設定新密碼（最少 6 個字符）`);
                            if (pw) resetPw.mutate({ userId: u.id, password: pw });
                          }}
                          className="px-2 py-1 text-ink/60 underline-offset-2 hover:underline"
                        >
                          重設密碼
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {userList.length === 0 && <EmptyRow colSpan={7} text={users.isLoading ? "載入中…" : "未有已登記用戶"} />}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
