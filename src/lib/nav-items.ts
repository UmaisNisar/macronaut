/**
 * The tab order, shared by the nav and the swipe gesture so they can never
 * disagree about what "next" means.
 */
export type NavItem = {
  href: string;
  label: string;
  emoji: string;
  color: string;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/today", label: "Today", emoji: "🍓", color: "var(--violet)" },
  { href: "/history", label: "Journal", emoji: "📖", color: "var(--sky)" },
  { href: "/progress", label: "Journey", emoji: "🚀", color: "var(--mint)" },
  { href: "/insights", label: "Insights", emoji: "✨", color: "var(--sun)" },
  { href: "/profile", label: "You", emoji: "🌱", color: "var(--peach)" },
];

export function navIndexOf(pathname: string): number {
  return NAV_ITEMS.findIndex(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
}
