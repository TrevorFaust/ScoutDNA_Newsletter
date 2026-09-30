import { redirect } from "next/navigation";

type Props = { params: Promise<{ date: string }> };

export default async function ExternalDraftsEditionPage({ params }: Props) {
  const { date } = await params;
  redirect(`/admin/review/${date}`);
}
