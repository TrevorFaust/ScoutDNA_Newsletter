import type { ReactNode } from "react";

type Props = { eyebrow: string; title: string; children?: ReactNode };

export function PageMasthead({ eyebrow, title, children }: Props) {
  return (
    <header className="masthead">
      <p className="masthead-eyebrow">{eyebrow}</p>
      <h1 className="masthead-title">{title}</h1>
      {children}
    </header>
  );
}
