import Link from "next/link";
import { Icon } from "./Icon";

// A large, easy-to-tap link card used on menu overview pages.
export function LinkCard({ href, title, description }: { href: string; title: string; description?: string }) {
  return (
    <Link
      href={href}
      className="group flex min-h-16 items-center justify-between gap-3 rounded-xl border-2 border-line bg-white px-4 py-3 hover:border-navy-800 hover:bg-navy-50"
    >
      <span>
        <span className="block text-lg font-bold text-navy-900 underline-offset-4 group-hover:underline">{title}</span>
        {description && <span className="block text-ink-3">{description}</span>}
      </span>
      <Icon name="arrowRight" className="text-navy-700" />
    </Link>
  );
}
