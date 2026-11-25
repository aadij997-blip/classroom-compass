"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/today", label: "Today", match: ["/today", "/sessions"] },
  { href: "/classes", label: "Classes", match: ["/classes"] },
  { href: "/teaching-ideas", label: "Teaching ideas", match: ["/teaching-ideas"] },
];

export function NavLinks() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="flex gap-1 text-[15px]">
      {LINKS.map((l) => {
        const active = l.match.some((m) => path === m || path.startsWith(`${m}/`));
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`inline-flex min-h-11 items-center rounded-xl px-3 transition-colors sm:px-4 ${active ? "bg-pale font-semibold text-ink" : "text-ink hover:bg-white"}`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
