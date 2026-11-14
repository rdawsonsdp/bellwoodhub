import Link from "next/link";
import type { Dictionary } from "@/lib/dictionaries";
import { localePath, type Locale } from "@/lib/i18n";
import { Icon, type IconName } from "@/components/ui/Icon";

// The "How do I…" grid: the nine things residents come to the site for most.
const tasks: { key: keyof Dictionary["home"]["howDoI"]; href: string; icon: IconName }[] = [
  { key: "payBill", href: "/services/pay-a-bill", icon: "card" },
  { key: "reportProblem", href: "/services/report-a-problem", icon: "wrench" },
  { key: "permit", href: "/services/permits", icon: "clipboard" },
  { key: "meeting", href: "/government/meetings", icon: "calendar" },
  { key: "sticker", href: "/services/vehicle-stickers", icon: "car" },
  { key: "contact", href: "/departments", icon: "building" },
  { key: "jobs", href: "/government/jobs", icon: "briefcase" },
  { key: "foia", href: "/government/foia", icon: "document" },
  { key: "alerts", href: "/services/alerts", icon: "bell" },
];

export function HowDoI({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  return (
    <section aria-labelledby="how-do-i">
      <h2 id="how-do-i" className="text-2xl font-bold text-navy-900 sm:text-3xl">
        {dict.home.howDoITitle}
      </h2>
      <ul className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3">
        {tasks.map((task) => {
          const text = dict.home.howDoI[task.key];
          return (
            <li key={task.key}>
              <Link
                href={localePath(locale, task.href)}
                className="group flex h-full min-h-28 flex-col gap-2 rounded-xl border-2 border-navy-800 bg-white p-4 hover:bg-navy-800 hover:text-white sm:flex-row sm:items-center sm:gap-4 sm:p-5"
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gold-100 text-navy-900">
                  <Icon name={task.icon} size={24} />
                </span>
                <span>
                  <span className="block text-lg font-bold leading-snug text-navy-900 group-hover:text-white">
                    {text.label}
                  </span>
                  <span className="block text-sm text-ink-3 group-hover:text-navy-100">{text.hint}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
