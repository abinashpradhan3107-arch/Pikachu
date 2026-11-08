import { queryOne } from "@/lib/db";
import { verifyPassword } from "@/lib/crypto";
import { createSession } from "@/lib/auth";
import { ApiError, handleRoute, json, rateLimit, readJson } from "@/lib/api";
import { loginSchema } from "@/lib/validation";
import type { Profile, User } from "@/lib/types";

export async function POST(request: Request) {
  return handleRoute(async () => {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    rateLimit(`login-ip:${ip}`, 30, 15 * 60_000);
    const body = loginSchema.parse(await readJson(request));
    rateLimit(`login-email:${body.email}`, 8, 15 * 60_000);

    const user = queryOne<User>("SELECT * FROM users WHERE email = ?", [body.email]);
    if (!user || !verifyPassword(body.password, user.password_hash)) {
      throw new ApiError(401, "Incorrect email or password.");
    }

    await createSession(user.id);
    const profile = queryOne<Profile>("SELECT * FROM profiles WHERE user_id = ?", [
      user.id,
    ]);

    return json({
      user: { id: user.id, name: user.name, email: user.email },
      redirect: profile?.onboarding_completed ? "/dashboard" : "/onboarding",
    });
  });
}
