import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { isOperator } from "@/lib/auth";
import { lock } from "./actions";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Freshroots Reorder Desk",
  description: "Twice-weekly reorder recommendations for Freshroots: rules decide, Gemini explains, Raghav approves.",
};

const NAV = [
  ["/", "Recommendations"],
  ["/pos", "Draft POs"],
  ["/tracker", "Loss tracker"],
  ["/rules", "Rules"],
  ["/upload", "SAP data"],
  ["/runs", "Run log"],
] as const;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const operator = await isOperator();
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <header className="bg-rail text-white">
          <div className="mx-auto max-w-7xl px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
            <Link href="/" className="font-semibold tracking-tight text-lg">
              Freshroots Reorder Desk
            </Link>
            <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-white/80">
              {NAV.map(([href, label]) => (
                <Link key={href} href={href} className="hover:text-white">
                  {label}
                </Link>
              ))}
              <a href="/components-map.png" className="hover:text-white" target="_blank">
                Components map
              </a>
            </nav>
            <div className="ml-auto text-sm">
              {operator ? (
                <form action={lock} className="flex items-center gap-2">
                  <span className="rounded bg-white/15 px-2 py-0.5">Operator: unlocked</span>
                  <button className="underline text-white/80 hover:text-white">Lock</button>
                </form>
              ) : (
                <Link href="/unlock" className="rounded bg-white/15 px-2 py-1 hover:bg-white/25">
                  View only · Unlock to act
                </Link>
              )}
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl px-4 py-6 flex-1">{children}</main>
        <footer className="border-t border-line text-xs text-muted">
          <div className="mx-auto max-w-7xl px-4 py-3">
            MESA Term 2 · Case 01 (Deepa&apos;s 90-Day Mandate) · Option A Demand Planning · AI proposes, code decides, Raghav approves. Never places a
            PO, never lets AI set a quantity, never guesses missing data.
          </div>
        </footer>
      </body>
    </html>
  );
}
