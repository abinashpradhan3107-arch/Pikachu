import { CoursesView } from "@/components/courses-view";
import { requireOnboarded } from "@/lib/auth";
import { dateInTimeZone, safeJsonParse } from "@/lib/utils";

export const metadata = { title: "Courses" };

export default async function CoursesPage() {
  const { profile } = await requireOnboarded();

  return (
    <CoursesView
      today={dateInTimeZone(profile.timezone)}
      weakSubjects={safeJsonParse<string[]>(profile.weak_subjects, [])}
    />
  );
}
