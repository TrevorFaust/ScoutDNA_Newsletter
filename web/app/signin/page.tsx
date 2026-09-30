import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { getViewer } from "@/lib/auth";

export const metadata = {
  title: "Sign in | ScoutDNA: All 32",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; denied?: string }>;
}) {
  const viewer = await getViewer();
  const params = await searchParams;
  if (viewer) {
    redirect(viewer.favoriteTeamSlug ? params.next || "/" : "/welcome");
  }

  return (
    <main className="auth-page">
      <header className="page-header">
        <h1>Sign in</h1>
        <p className="page-lead">
          Readers pick a favorite team so recaps open on that club. The
          editor desk — rumors, camp signals, and draft upload — stays on
          one account.
        </p>
      </header>
      {params.error === "link" ? (
        <p className="alert">That sign-in link expired. Request a new one.</p>
      ) : null}
      <AuthForm mode="signin" next={params.next} />
      <p className="auth-switch">
        New here? <Link href="/signup">Create an account</Link>
      </p>
    </main>
  );
}
