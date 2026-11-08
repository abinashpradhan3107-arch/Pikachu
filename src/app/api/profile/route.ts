import { queryOne, run } from "@/lib/db";
import { requireApiUser, handleRoute, json, readJson } from "@/lib/api";
import { profileSchema } from "@/lib/validation";
import { nowIso } from "@/lib/utils";
import type { Profile } from "@/lib/types";

export async function PATCH(request: Request) {
  return handleRoute(async () => {
    const { user } = await requireApiUser(request);
    const body = profileSchema.parse(await readJson(request));
    const current = queryOne<Profile>("SELECT * FROM profiles WHERE user_id = ?", [
      user.id,
    ]);
    if (!current) throw new Error("Profile not found.");
    const now = nowIso();

    if (body.name) {
      run("UPDATE users SET name = ?, updated_at = ? WHERE id = ?", [
        body.name,
        now,
        user.id,
      ]);
    }

    run(
      `UPDATE profiles SET
        college = ?, program = ?, year = ?, timezone = ?, study_hours = ?,
        preferred_start_hour = ?, session_length = ?, break_minutes = ?,
        learning_style = ?, explanation_level = ?, goals = ?, weak_subjects = ?,
        updated_at = ?
       WHERE user_id = ?`,
      [
        body.college ?? current.college,
        body.program !== undefined ? body.program : current.program,
        body.year !== undefined ? body.year : current.year,
        body.timezone ?? current.timezone,
        body.study_hours ?? current.study_hours,
        body.preferred_start_hour ?? current.preferred_start_hour,
        body.session_length ?? current.session_length,
        body.break_minutes ?? current.break_minutes,
        body.learning_style !== undefined ? body.learning_style : current.learning_style,
        body.explanation_level ?? current.explanation_level,
        body.goals !== undefined ? body.goals : current.goals,
        body.weak_subjects !== undefined
          ? JSON.stringify(body.weak_subjects)
          : current.weak_subjects,
        now,
        user.id,
      ],
    );

    return json({ ok: true });
  });
}
