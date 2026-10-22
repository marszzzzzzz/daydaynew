/**
 * 租戶第一次登入嘅引導（前後端共用，純函數）。
 * - 聯絡資料：香港電話統一格式「XXXX XXXX」，可以留空
 * - 改密碼：逐項檢查（長度、唔同舊密碼、兩次一樣），畫面上逐個打剔
 */
import { z } from "zod";

export const PASSWORD_MIN = 6;
export const PASSWORD_MAX = 72;
const HK_PHONE_DIGITS = 8;

/** "+852 9123-4567" → "9123 4567"；空白 → ""；格式錯 → null */
export function normalizeHkPhone(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return "";
  if (/[^\d\s+()-]/.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, "").replace(/^852(?=\d{8}$)/, "");
  if (digits.length !== HK_PHONE_DIGITS) return null;
  return `${digits.slice(0, 4)} ${digits.slice(4)}`;
}

export const contactSchema = z.object({
  phone: z
    .string()
    .max(30)
    .transform((s, ctx) => {
      const phone = normalizeHkPhone(s);
      if (phone === null) {
        ctx.addIssue({ code: "custom", message: "電話要係 8 位香港號碼（例如 9123 4567）" });
        return z.NEVER;
      }
      return phone;
    }),
  email: z
    .string()
    .trim()
    .max(100)
    .refine((s) => s === "" || z.email().safeParse(s).success, "電郵格式唔啱（例如 name@gmail.com）"),
});
export type Contact = z.infer<typeof contactSchema>;

export type PasswordCheck = { key: "length" | "different" | "match"; label: string; ok: boolean };

export function passwordChecks({ current, next, confirm }: { current: string; next: string; confirm: string }): PasswordCheck[] {
  return [
    { key: "length", label: `最少 ${PASSWORD_MIN} 個字`, ok: next.length >= PASSWORD_MIN && next.length <= PASSWORD_MAX },
    { key: "different", label: "唔同店主俾你嘅舊密碼", ok: next.length > 0 && next !== current },
    { key: "match", label: "兩次輸入一樣", ok: next.length > 0 && next === confirm },
  ];
}
