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

/** Desktop: fixed left sidebar, light, with a clear green active state. */
export function Sidebar() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-4">
      {NAV_GROUPS.map((g) => (
        <div key={g.title}>
          <div className="px-2.5 pb-1.5 text-[11.5px] font-medium text-faint">{g.title}</div>
          <ul className="space-y-0.5">
            {g.items.map((it) => {
              const active = isActive(path, it.href);
              return (
                <li key={it.href}>
                  <Link
                    href={it.href}
                    title={it.hint}
                    aria-current={active ? "page" : undefined}
                    className={`group relative flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] transition-colors ${
                      active ? "bg-rail-soft font-semibold text-rail" : "font-medium text-ink/75 hover:bg-sunk hover:text-ink"
                    }`}
                  >
                    {active && <span className="absolute inset-y-2 -left-3 w-[3px] rounded-r bg-rail" aria-hidden="true" />}
                    <Icon name={it.icon} className={`h-4 w-4 shrink-0 ${active ? "text-rail" : "text-faint group-hover:text-muted"}`} />
                    <span className="flex-1 truncate">{it.label}</span>
                    {it.step && (
                      <span className={`num grid h-[18px] min-w-[18px] place-items-center rounded px-1 text-[11px] font-semibold ${active ? "bg-rail text-white" : "bg-sunk text-faint"}`}>
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
        <div className="px-2.5 pb-1.5 text-[11.5px] font-medium text-faint">Reference</div>
        <a
          href="/components-map.png"
          target="_blank"
          rel="noreferrer"
          className="group flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] font-medium text-ink/75 transition-colors hover:bg-sunk hover:text-ink"
        >
          <Icon name="map" className="h-4 w-4 text-faint group-hover:text-muted" />
          <span className="flex-1">Components map</span>
          <Icon name="external" className="h-3.5 w-3.5 text-faint" />
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
    <nav aria-label="Main" className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-2.5 [scrollbar-width:none]">
      {items.map((it) => {
        const active = isActive(path, it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? "page" : undefined}
            className={`flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[13px] transition-colors ${
              active ? "bg-rail-soft font-semibold text-rail" : "font-medium text-muted hover:bg-sunk"
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
