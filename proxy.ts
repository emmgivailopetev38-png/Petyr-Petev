import { NextRequest, NextResponse } from "next/server";

function expectedToken(): string {
  const pw = process.env.ADMIN_PASSWORD!;
  const secret = process.env.AUTH_SECRET!;
  return Buffer.from(`${pw}:${secret}`).toString("base64url");
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublic =
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico";

  if (isPublic) return NextResponse.next();

  const token = request.cookies.get("zop_auth")?.value;
  if (!token || token !== expectedToken()) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
