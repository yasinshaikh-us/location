import { NextRequest, NextResponse } from "next/server";
import {
  createSessionToken,
  verifyPin,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { pin } = (await req.json()) as { pin?: string };

    if (!pin || typeof pin !== "string") {
      return NextResponse.json({ error: "Missing PIN" }, { status: 400 });
    }

    if (!verifyPin(pin)) {
      // Deliberately generic error — don't reveal whether the PIN
      // length or format was wrong vs. just incorrect.
      return NextResponse.json({ error: "Incorrect PIN" }, { status: 401 });
    }

    const token = await createSessionToken();
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: SESSION_MAX_AGE_SECONDS,
      path: "/",
    });
    return res;
  } catch (err) {
    console.error("Login error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
