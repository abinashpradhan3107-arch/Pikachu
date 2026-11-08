import { requireOnboarded } from "@/lib/auth";
import { PlanView } from "@/components/plan-view";
import { dateInTimeZone } from "@/lib/utils";

export const metadata = { title: "Study Plan" };

export default async function PlanPage() {
  const { profile } = await requireOnboarded();
  const today = dateInTimeZone(profile.timezone);

  return (
    <PlanView
      today={today}
      profile={{
        timezone: profile.timezone,
        study_hours: profile.study_hours,
        session_length: profile.session_length,
        break_minutes: profile.break_minutes,
      }}
    />
  );
}
