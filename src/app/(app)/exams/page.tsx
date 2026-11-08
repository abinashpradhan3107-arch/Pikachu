import { requireOnboarded } from "@/lib/auth";
import { ExamsView } from "@/components/exams-view";
import { dateInTimeZone } from "@/lib/utils";

export const metadata = { title: "Exams" };

export default async function ExamsPage() {
  const { profile } = await requireOnboarded();
  return <ExamsView today={dateInTimeZone(profile.timezone)} />;
}
