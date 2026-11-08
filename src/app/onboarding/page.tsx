import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { OnboardingWizard } from "@/components/onboarding-wizard";

export const metadata = { title: "Set up your workspace" };

export default async function OnboardingPage() {
  const { user, profile } = await requireAuth();
  if (profile.onboarding_completed) redirect("/dashboard");

  return <OnboardingWizard initialName={user.name} initialProfile={profile} />;
}
