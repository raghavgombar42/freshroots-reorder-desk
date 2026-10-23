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

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="Freshroots Reorder Desk, home">
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-rail text-white">
        <Icon name="box" className="h-4 w-4" />
      </span>
      <span className="leading-tight">
        <span className="block text-[14px] font-semibold tracking-[-0.01em] text-ink">Reorder Desk</span>
        <span className="block text-[11.5px] text-muted">Freshroots</span>
      </span>
    </Link>
  );
}

function OperatorStatus({ operator }: { operator: boolean }) {
  return operator ? (
    <form action={lock} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-board px-2.5 py-2">
      <span className="flex items-center gap-2 text-[12.5px] font-medium">
        <span className="h-2 w-2 rounded-full bg-rail" aria-hidden="true" />
        Operator unlocked
      </span>
      <button className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[12px] font-medium text-muted transition-colors hover:bg-sunk hover:text-ink">
        <Icon name="lock" className="h-3.5 w-3.5" />
        Lock
      </button>
    </form>
  ) : (
    <Link
      href="/unlock"
      className="flex items-center justify-between gap-2 rounded-lg border border-line bg-board px-2.5 py-2 text-[12.5px] font-medium transition-colors hover:border-line-strong"
    >
      <span className="flex items-center gap-2 text-muted">
        <span className="h-2 w-2 rounded-full bg-line-strong" aria-hidden="true" />
        View only
      </span>
      <span className="flex items-center gap-1 text-rail">
        <Icon name="unlock" className="h-3.5 w-3.5" />
        Unlock
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
        <a
          href="#content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:shadow"
        >
          Skip to content
        </a>

        {/* Desktop sidebar */}
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-[#fbfaf8] lg:flex">
          <div className="flex h-14 items-center border-b border-line px-5">
            <Brand />
          </div>
          <Sidebar />
          <div className="space-y-2.5 border-t border-line p-3">
            <OperatorStatus operator={operator} />
            <p className="px-1 text-[11.5px] leading-relaxed text-faint">MESA Term 2 · Case 01 pilot. Nothing is ordered automatically.</p>
          </div>
        </aside>

        {/* Mobile / tablet top bar */}
        <header className="sticky top-0 z-30 border-b border-line bg-[#fbfaf8]/95 px-4 pt-2.5 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between gap-3 pb-2.5">
            <Brand />
            {operator ? (
              <form action={lock}>
                <button className="flex h-8 items-center gap-1 rounded-lg border border-line-strong bg-white px-2.5 text-[12.5px] font-medium">
                  <Icon name="lock" className="h-3.5 w-3.5" /> Lock
                </button>
              </form>
            ) : (
              <Link href="/unlock" className="flex h-8 items-center gap-1 rounded-lg border border-line-strong bg-white px-2.5 text-[12.5px] font-medium text-rail">
                <Icon name="unlock" className="h-3.5 w-3.5" /> Unlock
              </Link>
            )}
          </div>
          <MobileTabs />
        </header>

        <div className="lg:pl-60">
          <main id="content" className="mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            {children}
          </main>
          <footer className="mx-auto max-w-[1180px] px-4 pb-6 text-[12px] leading-relaxed text-faint sm:px-6 lg:px-8">
            <div className="border-t border-line pt-3">
              Freshroots Reorder Desk · MESA Term 2, Case 01, Option A: Demand Planning · Never places a PO, never lets AI set a quantity, never guesses
              missing data.
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
