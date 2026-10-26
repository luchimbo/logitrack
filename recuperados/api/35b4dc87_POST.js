import { NextResponse } from "next/server";
import { SignJWT } from "jose";

function getJwtSecret() {
  const secret = String(process.env.JWT_SECRET || "").trim();
  if (!secret) return null;
  return new TextEncoder().encode(secret);
}

export async function POST() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Only available in development" }, { status: 404 });
  }

  const jwtSecret = getJwtSecret();
  if (!jwtSecret) {
    return NextResponse.json({ error: "JWT_SECRET is required" }, { status: 500 });
  }

  const token = await new SignJWT({ id: "dev-camilo", username: "camilo", role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(jwtSecret);

  const response = NextResponse.json({ success: true });
  response.cookies.set("auth_token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 8 * 60 * 60,
  });
  return response;
}
