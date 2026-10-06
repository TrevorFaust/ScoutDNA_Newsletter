import Link from "next/link";

function UsageMark() {
  return (
    <span className="home-feature-mark home-feature-clipboard" aria-hidden="true">
      <img
        src="/usage-clipboard.png"
        alt=""
        width={382}
        height={480}
      />
    </span>
  );
}

function TeamMark() {
  return (
    <span className="home-feature-mark home-feature-helmet" aria-hidden="true">
      <img
        src="/pick-a-team-helmet.png"
        alt=""
        width={416}
        height={480}
      />
    </span>
  );
}

function RecapMark() {
  return (
    <span className="home-feature-mark home-feature-newspaper" aria-hidden="true">
      <img
        src="/week-recap-newspaper.png"
        alt=""
        width={440}
        height={330}
      />
    </span>
  );
}

type Props = {
  latestHref?: string;
  latestLabel?: string;
};

export function HomeFeatureCards({ latestHref, latestLabel }: Props) {
  return (
    <section className="home-features" aria-label="What you can do here">
      <Link href={latestHref || "/weekly"} className="home-feature">
        <RecapMark />
        <h2>This week&apos;s recap</h2>
        <p>
          {latestLabel
            ? `${latestLabel}. All 32 clubs, cited, in one recap.`
            : "All 32 clubs, cited, in one recap."}
        </p>
      </Link>
      <Link href="/admin/usage" className="home-feature">
        <UsageMark />
        <h2>Usage report</h2>
        <p>Snaps, routes, and who quietly took the job.</p>
      </Link>
      <Link href="/teams" className="home-feature">
        <TeamMark />
        <h2>Pick a team</h2>
        <p>
          Skip the league letter. Open one club and stay on that beat.
        </p>
      </Link>
    </section>
  );
}
