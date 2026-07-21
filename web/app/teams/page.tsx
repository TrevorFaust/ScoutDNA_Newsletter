import Link from "next/link";
import { TeamGrid } from "@/components/TeamGrid";

export const metadata = {
  title: "Teams | ScoutDNA: All 32",
  description: "Browse NFL team archives: daily and weekly coverage for all 32 franchises.",
};

export default function TeamsPage() {
  return (
    <main>
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">Teams</span>
      </nav>

      <header className="page-header">
        <h1>All 32 teams</h1>
        <p className="page-lead">
          Pick a franchise to see its archive: every daily and weekly edition that
          included a section for that team. Jump straight to your team inside a full
          issue, or browse history team by team.
        </p>
        <Link href="/preferences" className="section-link">
          Set your favorite team →
        </Link>
      </header>

      <TeamGrid />
    </main>
  );
}
