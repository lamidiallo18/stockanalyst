"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export const NAV_ITEMS = [
  { href: "/", label: "Home", icon: "▣" },
  { href: "/new-analysis", label: "New Analysis", icon: "＋" },
  { href: "/company", label: "Company", icon: "₿" },
  { href: "/sector", label: "Sector / Theme", icon: "◉" },
  { href: "/portfolio", label: "Portfolio", icon: "⬡" },
  { href: "/tracker", label: "Thesis Tracker", icon: "✓" },
  { href: "/sources", label: "Source Library", icon: "❏" },
  { href: "/settings", label: "Settings", icon: "⚙" },
];

export function SideNav() {
  const pathname = usePathname();
  return (
    <nav className="flex w-56 shrink-0 flex-col border-r bg-[var(--surface)] p-3">
      <div className="mb-6 px-2 pt-2">
        <div className="text-base font-semibold tracking-tight">
          Stock<span className="text-[var(--accent)]">Analyst</span>
        </div>
        <div className="text-xs text-[var(--muted)]">
          buy-side research desk
        </div>
      </div>
      <ul className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-[var(--surface-2)] text-[var(--foreground)]"
                    : "text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]",
                )}
              >
                <span className="w-4 text-center text-[var(--muted)]">
                  {item.icon}
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="mt-auto px-2 pt-4 text-[10px] leading-tight text-[var(--muted)]">
        Research support, not investment advice. No guarantees.
      </div>
    </nav>
  );
}
