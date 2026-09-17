import type { Metadata, Viewport } from "next";
import { Newsreader, Source_Sans_3 } from "next/font/google";
import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import "./globals.css";

const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ScoutDNA: All 32",
  description: "Fantasy-focused daily NFL news for all 32 teams",
  icons: {
    icon: [{ url: "/tab-icon.png", type: "image/png" }],
    apple: "/tab-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0c1017",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${newsreader.variable} ${sourceSans.variable}`}>
      <body>
        <header className="site">
          <div className="site-inner">
            <Link href="/" className="brand" aria-label="ScoutDNA: All 32">
              <img
                src="/brand-wordmark.png"
                alt=""
                width={86}
                height={69}
                className="brand-logo"
              />
              <span className="brand-suffix">
                <span className="brand-colon">:</span> All 32
              </span>
            </Link>
            <SiteNav />
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
