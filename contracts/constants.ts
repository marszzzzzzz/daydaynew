export const Session = {
  cookieName: "gridbox_sid",
  /** 登入有效期 30 日 */
  maxAgeMs: 30 * 24 * 60 * 60 * 1000,
} as const;

export const ErrorMessages = {
  unauthenticated: "請先登入",
  insufficientRole: "你嘅戶口冇權限使用此功能",
} as const;

export const Paths = {
  login: "/login",
} as const;
