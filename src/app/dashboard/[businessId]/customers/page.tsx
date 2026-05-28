import { redirect } from "next/navigation";

type DashboardCustomersPageProps = {
  params: Promise<{ businessId: string }>;
};

export default async function DashboardCustomersPage({
  params
}: DashboardCustomersPageProps) {
  const { businessId } = await params;
  redirect(`/dashboard/${businessId}/loyalty`);
}
