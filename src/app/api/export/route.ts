import { queryAll, queryOne } from "@/lib/db";
import { requireApiUser, handleRoute } from "@/lib/api";
import type {
  Assignment,
  Chapter,
  Course,
  Exam,
  Note,
  Profile,
  Quiz,
  Resource,
  StudyTask,
  VideoRecommendation,
} from "@/lib/types";

export async function GET(request: Request) {
  return handleRoute(async () => {
    const { user } = await requireApiUser(request);
    const profile = queryOne<Profile>("SELECT * FROM profiles WHERE user_id = ?", [user.id]);
    const data = {
      exportedAt: new Date().toISOString(),
      app: "Cortex — IIT Jodhpur Study Assistant",
      user,
      profile,
      courses: queryAll<Course>("SELECT * FROM courses WHERE user_id = ?", [user.id]),
      chapters: queryAll<Chapter>("SELECT * FROM chapters WHERE user_id = ?", [user.id]),
      exams: queryAll<Exam>("SELECT * FROM exams WHERE user_id = ?", [user.id]),
      assignments: queryAll<Assignment>("SELECT * FROM assignments WHERE user_id = ?", [user.id]),
      tasks: queryAll<StudyTask>("SELECT * FROM study_tasks WHERE user_id = ?", [user.id]),
      notes: queryAll<Note>("SELECT * FROM notes WHERE user_id = ?", [user.id]),
      quizzes: queryAll<Quiz>("SELECT * FROM quizzes WHERE user_id = ?", [user.id]),
      resources: queryAll<Resource>("SELECT * FROM resources WHERE user_id = ?", [user.id]),
      videos: queryAll<VideoRecommendation>(
        "SELECT * FROM video_recommendations WHERE user_id = ?",
        [user.id],
      ),
    };
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="cortex-export-${new Date()
          .toISOString()
          .slice(0, 10)}.json"`,
        "Cache-Control": "no-store",
      },
    });
  });
}
