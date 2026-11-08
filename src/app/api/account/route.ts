import { queryOne, run } from "@/lib/db";
import { requireApiUser, handleRoute, json, readJson, ApiError } from "@/lib/api";
import { deleteAccountSchema } from "@/lib/validation";
import { verifyPassword } from "@/lib/crypto";
import type { User } from "@/lib/types";
import { destroySession } from "@/lib/auth";

export async function DELETE(request: Request) {
  return handleRoute(async () => {
    const { user } = await requireApiUser(request);
    const body = deleteAccountSchema.parse(await readJson(request));
    const row = queryOne<User>("SELECT * FROM users WHERE id = ?", [user.id]);
    if (!row || !verifyPassword(body.password, row.password_hash)) {
      throw new ApiError(400, "Your password is incorrect.");
    }
    await destroySession();
    run("DELETE FROM users WHERE id = ?", [user.id]);
    return json({ ok: true });
  });
}
