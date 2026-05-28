import { redirect } from "next/navigation";

type DashboardSettingsIndexPageProps = {
  params: Promise<{ businessId: string }>;
};

export default async function DashboardSettingsIndexPage({
  params
}: DashboardSettingsIndexPageProps) {
  const { businessId } = await params;
  redirect(`/dashboard/${businessId}/settings/staff`);
}
