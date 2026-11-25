import { NextResponse, type NextRequest } from "next/server";
import { LEARNER_COOKIE, learnerStoreForToken, secureCookies } from "@/lib/server/context";
import { allow, LIMITS } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

// Exchanges a private card token for a short-lived learner session, then
// redirects so the token does not stay in the address bar. Never logs tokens.
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ip = (req.headers.get("x-forwarded-for")?.split(",")[0] || "local").trim();
  const base = new URL("/check", req.url);
  if (!allow(`exchange:${ip}`, LIMITS.exchangePerIp.limit, LIMITS.exchangePerIp.windowMs)) {
    base.searchParams.set("link", "busy");
    return NextResponse.redirect(base, { headers: { "Cache-Control": "no-store" } });
  }
  const { store, kind } = learnerStoreForToken(token);
  const ex = await store.exchangeToken(token).catch(() => null);
  if (!ex) {
    base.searchParams.set("link", "invalid");
    const res = NextResponse.redirect(base, { headers: { "Cache-Control": "no-store" } });
    res.cookies.delete(LEARNER_COOKIE);
    return res;
  }
  const res = NextResponse.redirect(base, { headers: { "Cache-Control": "no-store" } });
  res.cookies.set(LEARNER_COOKIE, `${kind}.${ex.sessionToken}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookies,
    path: "/",
    expires: new Date(ex.expiresAt),
  });
  return res;
}
