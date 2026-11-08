import { queryOne, run, transaction } from "@/lib/db";
import { encryptSecret } from "@/lib/crypto";
import { requireApiUser, handleRoute, json, readJson } from "@/lib/api";
import { onboardingSchema } from "@/lib/validation";
import { courseColor, nowIso } from "@/lib/utils";
import type { Profile } from "@/lib/types";

export async function POST(request: Request) {
  return handleRoute(async () => {
    const { user } = await requireApiUser(request);
    const body = onboardingSchema.parse(await readJson(request));
    const now = nowIso();

    transaction(() => {
      if (body.name) {
        run("UPDATE users SET name = ?, updated_at = ? WHERE id = ?", [
          body.name,
          now,
          user.id,
        ]);
      }

      const profile = body.profile;
      const current = queryOne<Profile>("SELECT * FROM profiles WHERE user_id = ?", [
        user.id,
      ]);
      run(
        `UPDATE profiles SET
          college = ?, program = ?, year = ?, timezone = ?, study_hours = ?,
          preferred_start_hour = ?, session_length = ?, break_minutes = ?,
          learning_style = ?, explanation_level = ?, goals = ?, weak_subjects = ?,
          onboarding_completed = 1, updated_at = ?
         WHERE user_id = ?`,
        [
          profile.college ?? current?.college ?? "IIT Jodhpur",
          profile.program ?? current?.program ?? null,
          profile.year ?? current?.year ?? null,
          profile.timezone ?? current?.timezone ?? "Asia/Kolkata",
          profile.study_hours ?? current?.study_hours ?? 3,
          profile.preferred_start_hour ?? current?.preferred_start_hour ?? 18,
          profile.session_length ?? current?.session_length ?? 45,
          profile.break_minutes ?? current?.break_minutes ?? 10,
          profile.learning_style ?? current?.learning_style ?? null,
          profile.explanation_level ?? current?.explanation_level ?? "undergraduate",
          profile.goals ?? current?.goals ?? null,
          profile.weak_subjects
            ? JSON.stringify(profile.weak_subjects)
            : current?.weak_subjects ?? null,
          now,
          user.id,
        ],
      );

      const createdCourses: { id: string; title: string }[] = [];
      for (const [index, course] of (body.courses ?? []).entries()) {
        const courseId = crypto.randomUUID();
        run(
          `INSERT INTO courses
           (id, user_id, code, title, description, color, archived, created_at, updated_at)
           VALUES (?, ?, ?, ?, NULL, ?, 0, ?, ?)`,
          [
            courseId,
            user.id,
            course.code ?? null,
            course.title,
            course.color ?? courseColor(index),
            now,
            now,
          ],
        );
        createdCourses.push({ id: courseId, title: course.title });

        for (const [chapterIndex, chapterTitle] of (course.chapters ?? []).entries()) {
          run(
            `INSERT INTO chapters
             (id, user_id, course_id, title, unit, status, difficulty, confidence,
              estimated_minutes, notes, order_index, created_at, updated_at)
             VALUES (?, ?, ?, ?, NULL, 'not_started', 'medium', 3, 60, NULL, ?, ?, ?)`,
            [
              crypto.randomUUID(),
              user.id,
              courseId,
              chapterTitle,
              chapterIndex,
              now,
              now,
            ],
          );
        }
      }

      for (const exam of body.exams ?? []) {
        const course =
          exam.courseIndex != null ? createdCourses[exam.courseIndex] : undefined;
        run(
          `INSERT INTO exams
           (id, user_id, course_id, title, exam_date, start_time, exam_type, weight,
            location, syllabus, notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, NULL, ?, NULL, NULL, ?, NULL, ?, ?)`,
          [
            crypto.randomUUID(),
            user.id,
            course?.id ?? null,
            exam.title,
            exam.exam_date,
            exam.exam_type ?? "midterm",
            exam.syllabus ?? null,
            now,
            now,
          ],
        );
      }

      if (body.ai && body.ai.apiKey) {
        const existing = queryOne<{ user_id: string }>(
          "SELECT user_id FROM ai_settings WHERE user_id = ?",
          [user.id],
        );
        if (existing) {
          run(
            `UPDATE ai_settings SET provider = ?, base_url = ?, model = ?, api_key_enc = ?, updated_at = ?
             WHERE user_id = ?`,
            [
              body.ai.provider ?? "openai",
              body.ai.baseUrl,
              body.ai.model,
              encryptSecret(body.ai.apiKey),
              now,
              user.id,
            ],
          );
        } else {
          run(
            `INSERT INTO ai_settings
             (user_id, provider, base_url, model, api_key_enc, temperature, updated_at)
             VALUES (?, ?, ?, ?, ?, 0.4, ?)`,
            [
              user.id,
              body.ai.provider ?? "openai",
              body.ai.baseUrl,
              body.ai.model,
              encryptSecret(body.ai.apiKey),
              now,
            ],
          );
        }
      }
    });

    return json({ ok: true, redirect: "/dashboard" });
  });
}
