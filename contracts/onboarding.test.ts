import { describe, expect, it } from "vitest";
import { normalizeHkPhone, passwordChecks, contactSchema } from "./onboarding";

describe("normalizeHkPhone", () => {
  it("returns empty string when blank", () => expect(normalizeHkPhone("  ")).toBe(""));
  it("formats 8 digits as XXXX XXXX", () => expect(normalizeHkPhone("91234567")).toBe("9123 4567"));
  it("accepts spaces, hyphens and +852 prefix", () => {
    expect(normalizeHkPhone("+852 9123-4567")).toBe("9123 4567");
    expect(normalizeHkPhone("852 2123 4567")).toBe("2123 4567");
  });
  it("returns null for wrong length or letters", () => {
    expect(normalizeHkPhone("1234567")).toBeNull();
    expect(normalizeHkPhone("9123 456a")).toBeNull();
  });
});

describe("contactSchema", () => {
  it("normalises phone and trims email", () => {
    expect(contactSchema.parse({ phone: "91234567", email: " a@b.hk " })).toEqual({ phone: "9123 4567", email: "a@b.hk" });
  });
  it("allows both fields empty", () => expect(contactSchema.parse({ phone: "", email: "" })).toEqual({ phone: "", email: "" }));
  it("rejects invalid phone with a Cantonese message", () => {
    const r = contactSchema.safeParse({ phone: "123", email: "" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toMatch(/8 位/);
  });
  it("rejects invalid email", () => expect(contactSchema.safeParse({ phone: "", email: "abc" }).success).toBe(false));
});

describe("passwordChecks", () => {
  const ok = (r: ReturnType<typeof passwordChecks>) => r.map((c) => c.ok);
  it("all fail when empty", () => expect(ok(passwordChecks({ current: "", next: "", confirm: "" }))).toEqual([false, false, false]));
  it("passes when long enough, different and confirmed", () =>
    expect(ok(passwordChecks({ current: "old123", next: "new12345", confirm: "new12345" }))).toEqual([true, true, true]));
  it("flags reusing the current password", () =>
    expect(ok(passwordChecks({ current: "same123", next: "same123", confirm: "same123" }))).toEqual([true, false, true]));
  it("flags mismatch", () => expect(passwordChecks({ current: "a", next: "abcdef", confirm: "abcdeg" })[2].ok).toBe(false));
});
