import Link from "next/link";
import { getActiveAlert } from "@/lib/data/alerts";
import type { Dictionary } from "@/lib/dictionaries";
import { localePath, pick, type Locale } from "@/lib/i18n";
import { Container } from "@/components/ui/Container";
import { Icon } from "@/components/ui/Icon";

// The banner staff switch on and off from /admin (weather, water main breaks,
// road closures). It renders nothing when no alert is active.
const styles = {
  emergency: "bg-danger-700 text-white on-dark",
  warning: "bg-gold-400 text-ink",
  info: "bg-navy-100 text-navy-950",
} as const;

export async function AlertBanner({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const alert = await getActiveAlert();
  if (!alert) return null;

  const isExternal = alert.link_url?.startsWith("http");

  return (
    <section aria-label={dict.alert.label} className={styles[alert.severity]}>
      <Container className="flex items-start gap-3 py-3">
        <Icon name={alert.severity === "info" ? "info" : "alert"} size={22} className="mt-0.5" />
        <p className="text-base leading-snug">
          <strong className="font-bold">{dict.alert[alert.severity]}: </strong>
          {pick(locale, alert.message, alert.message_es)}{" "}
          {alert.link_url &&
            (isExternal ? (
              <a href={alert.link_url} className="font-semibold underline underline-offset-2">
                {dict.alert.details}
              </a>
            ) : (
              <Link
                href={localePath(locale, alert.link_url)}
                className="font-semibold underline underline-offset-2"
              >
                {dict.alert.details}
              </Link>
            ))}
        </p>
      </Container>
    </section>
  );
}
