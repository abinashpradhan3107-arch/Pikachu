import { requireOnboarded } from "@/lib/auth";
import { AssignmentsView } from "@/components/assignments-view";
import { dateInTimeZone } from "@/lib/utils";

export const metadata = { title: "Assignments" };

export default async function AssignmentsPage() {
  const { profile } = await requireOnboarded();
  return <AssignmentsView today={dateInTimeZone(profile.timezone)} />;
}
