import * as cookie from "cookie";
import { Session } from "@contracts/constants";

function isLocalhost(headers: Headers): boolean {
  const host = headers.get("host") || "";
  return /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
}

/** 前後端同一個網域，用 SameSite=Lax 已經足夠，亦可以擋 CSRF */
function serializeSession(headers: Headers, value: string, maxAgeSec: number) {
  return cookie.serialize(Session.cookieName, value, {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: !isLocalhost(headers),
    maxAge: maxAgeSec,
  });
}

export function setSessionCookie(ctx: { req: Request; resHeaders: Headers }, token: string) {
  ctx.resHeaders.append("set-cookie", serializeSession(ctx.req.headers, token, Session.maxAgeMs / 1000));
}

export function clearSessionCookie(ctx: { req: Request; resHeaders: Headers }) {
  ctx.resHeaders.append("set-cookie", serializeSession(ctx.req.headers, "", 0));
}
