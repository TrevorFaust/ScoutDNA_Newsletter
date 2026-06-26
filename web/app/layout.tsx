import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "ScoutDNA: All 32",
  description: "Fantasy-focused daily NFL news for all 32 teams",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <header className="site">
          <Link href="/" className="brand">
            ScoutDNA: All 32
          </Link>
        </header>
        {children}
      </body>
    </html>
  );
}
