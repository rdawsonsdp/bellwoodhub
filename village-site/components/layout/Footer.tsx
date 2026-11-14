import Link from "next/link";
import type { Dictionary } from "@/lib/dictionaries";
import { localePath, type Locale } from "@/lib/i18n";
import { site } from "@/lib/site";
import { Container } from "@/components/ui/Container";
import { ExternalLink } from "@/components/ui/ExternalLink";
import { Icon } from "@/components/ui/Icon";
import { NewsletterForm } from "@/components/forms/NewsletterForm";

const linkClass = "inline-flex min-h-11 items-center underline underline-offset-4 hover:text-gold-400";

export function Footer({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const f = dict.footer;
  const { villageHall, emergency } = site;

  const emergencyRows = [
    { label: f.policeNonEmergency, number: emergency.policeNonEmergency },
    { label: f.fireNonEmergency, number: emergency.fireNonEmergency },
    { label: f.waterEmergency, number: emergency.waterEmergency },
  ];

  return (
    <footer className="on-dark mt-16 bg-navy-900 text-white">
      <Container className="grid gap-10 py-12 md:grid-cols-2 lg:grid-cols-[1.1fr_1fr_1.3fr]">
        <section aria-labelledby="footer-hall">
          <h2 id="footer-hall" className="text-xl font-bold text-gold-400">
            {f.villageHall}
          </h2>
          <address className="mt-3 not-italic">
            <p className="flex gap-2">
              <Icon name="pin" className="mt-1" />
              <span>
                {villageHall.street}
                <br />
                {villageHall.cityStateZip}
              </span>
            </p>
            <p className="mt-1">
              <ExternalLink href={villageHall.mapUrl} newTabLabel={dict.common.opensNewTab} className={linkClass}>
                {dict.common.getDirections}
              </ExternalLink>
            </p>
            <p>
              <a href={villageHall.phoneHref} className={`${linkClass} gap-2 text-lg font-bold`}>
                <Icon name="phone" />
                <span className="sr-only">{dict.common.call} </span>
                {villageHall.phone}
              </a>
            </p>
          </address>
          <h3 className="mt-4 flex items-center gap-2 font-bold">
            <Icon name="clock" />
            {dict.common.hours}
          </h3>
          <ul className="mt-1 text-navy-100">
            <li>{f.hoursWeekdays}</li>
            <li>{f.hoursSaturday}</li>
            <li>{f.hoursSunday}</li>
          </ul>
        </section>

        <section aria-labelledby="footer-emergency">
          <h2 id="footer-emergency" className="text-xl font-bold text-gold-400">
            {f.emergencyTitle}
          </h2>
          <p className="mt-3">
            {f.emergency}:{" "}
            <a href="tel:911" className="text-2xl font-bold underline underline-offset-4 hover:text-gold-400">
              <span className="sr-only">{dict.common.call} </span>
              {emergency.emergencyNumber}
            </a>
          </p>
          {/* TODO(content): these three numbers are the Village Hall main line until staff confirm the direct lines. */}
          <dl className="mt-2">
            {emergencyRows.map((row) => (
              <div key={row.label} className="border-t border-white/20 py-1">
                <dt className="text-navy-100">{row.label}</dt>
                <dd>
                  <a href={row.number.href} className={`${linkClass} font-bold`}>
                    <span className="sr-only">{dict.common.call} </span>
                    {row.number.display}
                  </a>
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <div className="md:col-span-2 lg:col-span-1">
          <section aria-labelledby="footer-newsletter">
            <h2 id="footer-newsletter" className="text-xl font-bold text-gold-400">
              {f.newsletterTitle}
            </h2>
            <p className="mt-3 text-navy-100">{f.newsletterBody}</p>
            <NewsletterForm locale={locale} labels={f} />
          </section>

          <section aria-labelledby="footer-social" className="mt-4">
            <h2 id="footer-social" className="text-xl font-bold text-gold-400">
              {f.followTitle}
            </h2>
            {/* TODO(content): replace with the Village's official social media account links. */}
            <ul className="mt-2 flex flex-wrap gap-x-5">
              {site.social.map((account) => (
                <li key={account.name}>
                  <ExternalLink
                    href={account.href}
                    newTabLabel={dict.common.opensNewTab}
                    className={`${linkClass} font-semibold`}
                  >
                    <span className="sr-only">{f.followOn} </span>
                    {account.name}
                  </ExternalLink>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </Container>

      <div className="border-t border-white/20">
        <Container className="flex flex-col gap-2 py-5 md:flex-row md:items-center md:justify-between">
          <nav aria-label={f.quickLinks}>
            <ul className="flex flex-wrap gap-x-6">
              {[
                { label: f.contact, href: "/contact" },
                { label: f.faq, href: "/faq" },
                { label: f.accessibility, href: "/accessibility" },
                { label: f.privacy, href: "/privacy" },
                { label: f.siteMap, href: "/site-map" },
              ].map((link) => (
                <li key={link.href}>
                  <Link href={localePath(locale, link.href)} className={linkClass}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <p className="text-navy-100">
            © {f.copyright}
          </p>
        </Container>
      </div>
    </footer>
  );
}
