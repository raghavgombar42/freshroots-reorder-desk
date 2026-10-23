"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { Icon, type IconName } from "./icons";

type Item = { href: string; label: string; icon: IconName; hint: string; step?: number };

// Ordered the way the desk is used: the twice-weekly workflow first, then setup and audit pages.
export const NAV_GROUPS: { title: string; items: Item[] }[] = [
  {
    title: "Workflow",
    items: [
      { href: "/", label: "Recommendations", icon: "list", hint: "Review and decide", step: 1 },
      { href: "/pos", label: "Draft POs", icon: "file", hint: "Approved lines → Zoho", step: 2 },
      { href: "/tracker", label: "Loss tracker", icon: "chart", hint: "Outcome vs baseline", step: 3 },
    ],
  },
  {
    title: "Setup & audit",
    items: [
      { href: "/upload", label: "SAP data", icon: "upload", hint: "Input files" },
      { href: "/rules", label: "Rules", icon: "sliders", hint: "Raghav's thresholds" },
      { href: "/runs", label: "Run log", icon: "history", hint: "Every run, audited" },
    ],
  },
];

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));

/** Desktop: fixed left sidebar. */
export function Sidebar() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-1 flex-col gap-6 px-3 py-5">
      {NAV_GROUPS.map((g) => (
        <div key={g.title}>
          <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/45">{g.title}</div>
          <ul className="space-y-0.5">
            {g.items.map((it) => {
              const active = isActive(path, it.href);
              return (
                <li key={it.href}>
                  <Link
                    href={it.href}
                    aria-current={active ? "page" : undefined}
                    className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                      active ? "bg-white/12 font-semibold text-white" : "text-white/70 hover:bg-white/6 hover:text-white"
                    }`}
                  >
                    {active && <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r bg-[#9be3bf]" aria-hidden="true" />}
                    <Icon name={it.icon} className={`h-4 w-4 shrink-0 ${active ? "text-[#9be3bf]" : "text-white/55 group-hover:text-white/80"}`} />
                    <span className="flex-1">
                      <span className="block leading-tight">{it.label}</span>
                      <span className={`block text-[11px] font-normal leading-tight ${active ? "text-white/65" : "text-white/40"}`}>{it.hint}</span>
                    </span>
                    {it.step && (
                      <span className={`grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold ${active ? "bg-[#9be3bf] text-rail" : "bg-white/10 text-white/55"}`}>
                        {it.step}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <div>
        <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/45">Reference</div>
        <a
          href="/components-map.png"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/70 transition-colors hover:bg-white/6 hover:text-white"
        >
          <Icon name="map" className="h-4 w-4 text-white/55" />
          <span className="flex-1">Components map</span>
          <Icon name="external" className="h-3.5 w-3.5 text-white/40" />
        </a>
      </div>
    </nav>
  );
}

/** Mobile / tablet: horizontally scrollable tabs under the top bar. */
export function MobileTabs() {
  const path = usePathname();
  const items = NAV_GROUPS.flatMap((g) => g.items);
  return (
    <nav aria-label="Main" className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-2 [scrollbar-width:none]">
      {items.map((it) => {
        const active = isActive(path, it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? "page" : undefined}
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors ${
              active ? "bg-white font-semibold text-rail" : "text-white/75 hover:bg-white/10"
            }`}
          >
            <Icon name={it.icon} className="h-3.5 w-3.5" />
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Switching tabs always lands at the top of the new page; actions on the same page keep their position. */
export function ScrollToTop() {
  const path = usePathname();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
  }, [path]);
  return null;
}
