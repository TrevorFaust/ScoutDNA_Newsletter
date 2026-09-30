import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { getViewer } from "@/lib/auth";

export const metadata = {
  title: "Create account | ScoutDNA: All 32",
};

export default async function SignupPage() {
  const viewer = await getViewer();
  if (viewer) {
    redirect(viewer.favoriteTeamSlug ? "/" : "/welcome");
  }

  return (
    <main className="auth-page">
      <header className="page-header">
        <h1>Create an account</h1>
        <p className="page-lead">
          After you sign in the first time, you pick a favorite team. Recaps
          jump to that club. Writing and review stay with the editor.
        </p>
      </header>
      <AuthForm mode="signup" next="/welcome" />
      <p className="auth-switch">
        Already have an account? <Link href="/signin">Sign in</Link>
      </p>
    </main>
  );
}
