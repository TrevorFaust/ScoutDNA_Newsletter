type Footnote = { n: number; label: string; url: string };

export function ReferencesDropdown({ footnotes }: { footnotes: Footnote[] }) {
  if (!footnotes?.length) return null;
  return (
    <details className="references">
      <summary>References ({footnotes.length})</summary>
      <ul className="footnote-list">
        {footnotes.map((fn) => (
          <li key={fn.n}>
            <span className="fn-index">{fn.n}.</span>
            {fn.url ? (
              <a
                className="fn-link"
                href={fn.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {fn.label}
              </a>
            ) : (
              <span className="fn-body">{fn.label}</span>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
