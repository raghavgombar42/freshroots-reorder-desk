import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { isOperator } from "@/lib/auth";
import { lock } from "./actions";
import { Icon } from "./icons";
import { MobileTabs, ScrollToTop, Sidebar } from "./nav";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Freshroots Reorder Desk",
  description: "Twice-weekly reorder recommendations for Freshroots: rules decide, Gemini explains, Raghav approves.",
};

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="Freshroots Reorder Desk, home">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#9be3bf] text-rail">
        <Icon name="box" className="h-4.5 w-4.5" />
      </span>
      <span className="leading-tight">
        <span className="block text-[15px] font-semibold tracking-tight text-white">Reorder Desk</span>
        {!compact && <span className="block text-[11px] text-white/55">Freshroots · demand planning</span>}
      </span>
    </Link>
  );
}

function OperatorStatus({ operator }: { operator: boolean }) {
  return operator ? (
    <form action={lock} className="flex items-center justify-between gap-2 rounded-lg bg-white/8 px-3 py-2">
      <span className="flex items-center gap-2 text-[13px] text-white">
        <span className="h-2 w-2 rounded-full bg-[#9be3bf]" aria-hidden="true" />
        Operator unlocked
      </span>
      <button className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-white/70 hover:bg-white/10 hover:text-white">
        <Icon name="lock" className="h-3.5 w-3.5" />
        Lock
      </button>
    </form>
  ) : (
    <Link href="/unlock" className="flex items-center justify-between gap-2 rounded-lg bg-white/8 px-3 py-2 text-[13px] text-white/80 hover:bg-white/12 hover:text-white">
      <span className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-white/40" aria-hidden="true" />
        View only
      </span>
      <span className="flex items-center gap-1 text-xs font-semibold">
        <Icon name="unlock" className="h-3.5 w-3.5" />
        Unlock to act
      </span>
    </Link>
  );
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const operator = await isOperator();
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
      <body className="min-h-screen font-sans">
        <ScrollToTop />
        <a href="#content" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:shadow">
          Skip to content
        </a>

        {/* Desktop sidebar */}
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-rail lg:flex">
          <div className="border-b border-white/10 px-5 py-4">
            <Brand />
          </div>
          <Sidebar />
          <div className="space-y-3 border-t border-white/10 p-4">
            <OperatorStatus operator={operator} />
            <p className="px-1 text-[11px] leading-relaxed text-white/45">
              MESA Term 2 · Case 01 pilot. Rules decide, AI explains, Raghav approves. Nothing is ordered automatically.
            </p>
          </div>
        </aside>

        {/* Mobile / tablet top bar */}
        <header className="sticky top-0 z-30 bg-rail px-4 pt-3 shadow-md lg:hidden">
          <div className="flex items-center justify-between gap-3 pb-3">
            <Brand compact />
            {operator ? (
              <form action={lock}>
                <button className="flex items-center gap-1 rounded-md bg-white/10 px-2.5 py-1.5 text-xs text-white">
                  <Icon name="lock" className="h-3.5 w-3.5" /> Lock
                </button>
              </form>
            ) : (
              <Link href="/unlock" className="flex items-center gap-1 rounded-md bg-white/10 px-2.5 py-1.5 text-xs font-semibold text-white">
                <Icon name="unlock" className="h-3.5 w-3.5" /> Unlock
              </Link>
            )}
          </div>
          <MobileTabs />
        </header>

        <div className="lg:pl-64">
          <main id="content" className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
            {children}
          </main>
          <footer className="mx-auto max-w-6xl px-4 pb-8 text-[12px] leading-relaxed text-muted sm:px-6 lg:px-10">
            <div className="border-t border-line pt-4">
              Freshroots Reorder Desk · MESA Term 2, Case 01 (Deepa&apos;s 90-Day Mandate), Option A: Demand Planning. The Cut: never places a PO, never lets AI
              set a quantity, never guesses missing data.
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
