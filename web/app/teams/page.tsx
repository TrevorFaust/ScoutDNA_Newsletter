import Link from "next/link";
import { TeamGrid } from "@/components/TeamGrid";

export const metadata = {
  title: "Teams | ScoutDNA: All 32",
  description: "Browse NFL team archives: weekly recaps for all 32 franchises.",
};

export default function TeamsPage() {
  return (
    <main>
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">Teams</span>
      </nav>

      <header className="page-header page-header-center">
        <h1>All 32 teams</h1>
        <p className="page-lead teams-lead">
          Start with your squad then check out the others. Every club keeps its
          own file, updated each Tuesday with what happened, who got the work,
          and what the reporting says comes next. Read one week or read back to
          September and watch a season take shape. Keep your team close, keep
          your division rivals closer.
        </p>
        <Link href="/preferences" className="section-link">
          Set your favorite team in Account →
        </Link>
      </header>

      <TeamGrid />
    </main>
  );
}
