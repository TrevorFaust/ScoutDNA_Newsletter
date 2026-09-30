import Link from "next/link";

function UsageMark() {
  return (
    <svg
      className="home-feature-mark home-feature-chart"
      viewBox="0 0 148 92"
      aria-hidden="true"
    >
      <rect x="18" y="8" width="112" height="78" rx="5" fill="var(--forest)" />
      <rect x="22" y="4" width="18" height="10" rx="2" fill="var(--ink)" />
      <rect x="108" y="4" width="18" height="10" rx="2" fill="var(--ink)" />
      <rect x="36" y="2" width="76" height="12" rx="3" fill="var(--weekly)" />
      <rect x="24" y="16" width="100" height="64" rx="3" fill="var(--white)" />
      <g stroke="var(--paper-deep)" strokeWidth="0.7">
        <line x1="32" y1="28" x2="116" y2="28" />
        <line x1="32" y1="40" x2="116" y2="40" />
        <line x1="32" y1="52" x2="116" y2="52" />
      </g>
      <rect x="32" y="31" width="72" height="7" rx="1.5" fill="var(--forest)" />
      <rect x="32" y="43" width="54" height="7" rx="1.5" fill="var(--ink)" />
      <rect x="32" y="55" width="38" height="7" rx="1.5" fill="var(--weekly)" />
      <g
        fill="var(--forest)"
        fontSize="6.4"
        fontWeight="700"
        letterSpacing="0.4"
        textAnchor="middle"
        style={{ fontFamily: "var(--font-body)" }}
      >
        <text x="42.5" y="74">YDS</text>
        <text x="63.5" y="74">REC</text>
        <text x="84.5" y="74">TD</text>
        <text x="105.5" y="74">FPTS</text>
      </g>
    </svg>
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
