import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDictionary } from "@/lib/dictionaries";
import { getPaymentTypes } from "@/lib/data/payments";
import { hasLocale, localePath, pick } from "@/lib/i18n";
import { site } from "@/lib/site";
import { Container } from "@/components/ui/Container";
import { ExternalLink } from "@/components/ui/ExternalLink";
import { Icon } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";

export async function generateMetadata({ params }: PageProps<"/[locale]/services/pay-a-bill">): Promise<Metadata> {
  const { locale } = await params;
  const dict = getDictionary(hasLocale(locale) ? locale : "en");
  return { title: dict.pay.title, description: dict.pay.intro };
}

// One card per payment type. Each card says what it covers, names the company
// that takes the payment and links out to it. No payments are processed here.
export default async function PayABillPage({ params }: PageProps<"/[locale]/services/pay-a-bill">) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  const dict = getDictionary(locale);
  const t = dict.pay;
  const payments = await getPaymentTypes();

  return (
    <>
      <PageHeader
        title={t.title}
        intro={t.intro}
        breadcrumbLabel={dict.common.breadcrumb}
        crumbs={[
          { label: dict.common.home, href: localePath(locale, "/") },
          { label: dict.nav.menus.services, href: localePath(locale, "/services") },
          { label: t.title },
        ]}
      />
      <Container className="py-10">
        <p className="flex max-w-3xl items-start gap-2 rounded-lg bg-navy-50 p-4 text-navy-950">
          <Icon name="external" className="mt-1" />
          {t.newTabNote}
        </p>

        <ul className="mt-6 grid gap-5 md:grid-cols-2">
          {payments.map((payment) => {
            const title = pick(locale, payment.title, payment.title_es);
            const needReady = pick(locale, payment.need_ready ?? "", payment.need_ready_es);
            return (
              <li key={payment.id} className="flex flex-col rounded-2xl border-2 border-line bg-white p-5 sm:p-6">
                <h2 className="text-2xl font-bold text-navy-900">{title}</h2>
                <dl className="mt-3 flex-1 space-y-3">
                  <div>
                    <dt className="text-sm font-bold uppercase tracking-wide text-ink-3">{t.covers}</dt>
                    <dd>{pick(locale, payment.covers, payment.covers_es)}</dd>
                  </div>
                  {needReady && (
                    <div>
                      <dt className="text-sm font-bold uppercase tracking-wide text-ink-3">{t.needReady}</dt>
                      <dd>{needReady}</dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-sm font-bold uppercase tracking-wide text-ink-3">{t.handledBy}</dt>
                    <dd className="font-semibold">{payment.vendor_name}</dd>
                  </div>
                </dl>
                <ExternalLink
                  href={payment.vendor_url}
                  newTabLabel={dict.common.opensNewTab}
                  className="mt-5 inline-flex min-h-12 items-center justify-center rounded-lg bg-navy-800 px-5 text-center text-lg font-bold text-white hover:bg-navy-950"
                >
                  {t.payButton}: {title}
                  <span className="sr-only">
                    {" "}
                    {t.at} {payment.vendor_name}
                  </span>
                </ExternalLink>
              </li>
            );
          })}
        </ul>

        <div className="mt-12 grid gap-8 md:grid-cols-3">
          <section aria-labelledby="pay-not-sure" className="md:col-span-2">
            <h2 id="pay-not-sure" className="text-2xl font-bold text-navy-900">
              {t.notSureTitle}
            </h2>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              {t.notSure.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <h2 className="mt-8 text-2xl font-bold text-navy-900">{t.inPersonTitle}</h2>
            {/* TODO(content): confirm which bills can be paid at Village Hall, accepted payment
                methods (cash, check, card) and whether there is a drop box or mail-in address. */}
            <p className="mt-3">{t.inPerson}</p>
          </section>
          <section aria-labelledby="pay-help" className="self-start rounded-2xl bg-paper p-5">
            <h2 id="pay-help" className="text-xl font-bold text-navy-900">
              {t.helpTitle}
            </h2>
            <p className="mt-2">{t.help}</p>
            <p className="mt-3">
              <a href={site.villageHall.phoneHref} className="prose-link text-lg font-bold">
                {dict.common.call} {site.villageHall.phone}
              </a>
            </p>
          </section>
        </div>
      </Container>
    </>
  );
}
