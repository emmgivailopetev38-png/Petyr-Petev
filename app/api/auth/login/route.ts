import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  let password: string;
  try {
    ({ password } = (await request.json()) as { password: string });
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  if (password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const token = Buffer.from(
    `${process.env.ADMIN_PASSWORD}:${process.env.AUTH_SECRET}`
  ).toString("base64url");

  const response = NextResponse.json({ ok: true });
  response.cookies.set("zop_auth", token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return response;
}
