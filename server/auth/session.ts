import * as jose from "jose";
import * as cookie from "cookie";
import { env } from "../lib/env";
import { Session } from "@contracts/constants";
import { findUserByUnionId } from "../queries/users";
import type { SessionPayload } from "./types";

const JWT_ALG = "HS256";
const secret = () => new TextEncoder().encode(env.sessionSecret);

export async function signSessionToken(payload: SessionPayload): Promise<string> {
  return new jose.SignJWT(payload)
    .setProtectedHeader({ alg: JWT_ALG })
    .setIssuedAt()
    .setExpirationTime(`${Math.floor(Session.maxAgeMs / 1000)}s`)
    .sign(secret());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jose.jwtVerify(token, secret(), { algorithms: [JWT_ALG] });
    return typeof payload.unionId === "string" ? { unionId: payload.unionId } : null;
  } catch {
    return null;
  }
}

/** 由 cookie 認出登入用戶；冇登入 / token 無效 / 戶口已刪 → null */
export async function authenticateRequest(headers: Headers) {
  const token = cookie.parse(headers.get("cookie") || "")[Session.cookieName];
  if (!token) return null;
  const claim = await verifySessionToken(token);
  if (!claim) return null;
  // 示範模式關閉後，demo 戶口嘅舊 session 一律失效
  if (!env.demoMode && isDemoUnionId(claim.unionId)) return null;
  return (await findUserByUnionId(claim.unionId)) ?? null;
}

export function isDemoUnionId(unionId: string) {
  return unionId.startsWith("local:demo-");
}
