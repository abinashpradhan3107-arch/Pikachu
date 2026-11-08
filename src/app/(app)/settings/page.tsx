import { SettingsView } from "@/components/settings-view";
import { requireOnboarded } from "@/lib/auth";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { user, profile } = await requireOnboarded();
  return (
    <SettingsView
      user={{ name: user.name, email: user.email, created_at: user.created_at }}
      profile={{ ...profile }}
    />
  );
}
