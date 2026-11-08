import { queryOne, run } from "@/lib/db";
import { requireApiUser, handleRoute, json, readJson, ApiError } from "@/lib/api";
import { passwordChangeSchema } from "@/lib/validation";
import { hashPassword, verifyPassword } from "@/lib/crypto";
import { nowIso } from "@/lib/utils";
import type { User } from "@/lib/types";

export async function POST(request: Request) {
  return handleRoute(async () => {
    const { user } = await requireApiUser(request);
    const body = passwordChangeSchema.parse(await readJson(request));
    const row = queryOne<User>("SELECT * FROM users WHERE id = ?", [user.id]);
    if (!row || !verifyPassword(body.currentPassword, row.password_hash)) {
      throw new ApiError(400, "Your current password is incorrect.");
    }
    run("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?", [
      hashPassword(body.newPassword),
      nowIso(),
      user.id,
    ]);
    return json({ ok: true });
  });
}
