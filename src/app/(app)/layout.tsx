import { requireOnboarded } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await requireOnboarded();

  return (
    <AppShell
      user={{ name: user.name, email: user.email }}
      profile={{
        study_hours: profile.study_hours,
        timezone: profile.timezone,
        program: profile.program,
        year: profile.year,
      }}
    >
      {children}
    </AppShell>
  );
}
