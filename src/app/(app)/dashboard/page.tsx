import { requireOnboarded } from "@/lib/auth";
import { DashboardView } from "@/components/dashboard-view";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const { user } = await requireOnboarded();
  return <DashboardView userName={user.name} />;
}
