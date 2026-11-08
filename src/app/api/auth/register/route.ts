import { queryOne, run } from "@/lib/db";
import { hashPassword } from "@/lib/crypto";
import { createSession } from "@/lib/auth";
import { ApiError, handleRoute, json, rateLimit, readJson } from "@/lib/api";
import { registerSchema } from "@/lib/validation";
import { nowIso } from "@/lib/utils";
import type { User } from "@/lib/types";

export async function POST(request: Request) {
  return handleRoute(async () => {
    rateLimit(`register:${request.headers.get("x-forwarded-for") ?? "local"}`, 10, 60_000);
    const body = registerSchema.parse(await readJson(request));
    const existing = queryOne<User>("SELECT * FROM users WHERE email = ?", [body.email]);
    if (existing) {
      throw new ApiError(409, "An account with that email already exists.");
    }

    const now = nowIso();
    const userId = crypto.randomUUID();
    run(
      `INSERT INTO users (id, email, name, password_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, body.email, body.name, hashPassword(body.password), now, now],
    );
    run(
      `INSERT INTO profiles
       (user_id, college, timezone, study_hours, preferred_start_hour, session_length,
        break_minutes, explanation_level, onboarding_completed, created_at, updated_at)
       VALUES (?, 'IIT Jodhpur', 'Asia/Kolkata', 3, 18, 45, 10, 'undergraduate', 0, ?, ?)`,
      [userId, now, now],
    );

    await createSession(userId);
    return json({
      user: { id: userId, name: body.name, email: body.email },
      redirect: "/onboarding",
    });
  });
}
