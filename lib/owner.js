import { randomUUID } from "crypto";
import { getServerSession } from "next-auth/next";
import { authEnabled, authOptions } from "./auth";

const COOKIE = "rag_uid";
const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * Who owns the documents in this request: the signed-in user when auth is on,
 * otherwise an anonymous id kept in an httpOnly cookie. Every document query is
 * filtered by this id, so one visitor can't read another visitor's PDFs.
 */
export async function getOwner(req, res) {
  if (authEnabled) {
    const session = await getServerSession(req, res, authOptions);
    if (session?.user?.id) return { id: session.user.id, user: session.user };
  }

  let anonId = req.cookies?.[COOKIE];
  if (!anonId || !/^[0-9a-f-]{36}$/.test(anonId)) {
    anonId = randomUUID();
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    const cookie = `${COOKIE}=${anonId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${ONE_YEAR}${secure}`;
    const existing = res.getHeader("Set-Cookie");
    res.setHeader("Set-Cookie", existing ? [].concat(existing, cookie) : cookie);
  }
  return { id: `anon:${anonId}`, user: null };
}
