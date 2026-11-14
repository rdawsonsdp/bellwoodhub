import { notFound } from "next/navigation";
import { getDictionary } from "@/lib/dictionaries";
import { hasLocale, localePath } from "@/lib/i18n";
import { Container } from "@/components/ui/Container";
import { SearchForm } from "@/components/layout/SearchForm";
import { HowDoI } from "@/components/home/HowDoI";
import {
  EatAndStay,
  LatestNews,
  MayorMessage,
  UpcomingEvents,
  UpcomingMeetings,
} from "@/components/home/HomeSections";

// Homepage, top to bottom: (alert banner, in the layout) → hero with search →
// "How do I…" → next meetings → news and events → Mayor's message →
// Eat & Stay in Bellwood → (footer, in the layout).
export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  const dict = getDictionary(locale);

  return (
    <>
      <section className="on-dark bg-navy-800 text-white">
        <Container className="py-10 sm:py-14">
          <h1 className="text-4xl font-bold leading-tight sm:text-5xl">{dict.common.villageName}</h1>
          <p className="mt-3 max-w-2xl text-lg text-navy-100 sm:text-xl">{dict.home.heroLine}</p>
          <div className="mt-6 max-w-2xl">
            <SearchForm
              id="hero-search"
              size="lg"
              action={localePath(locale, "/search")}
              label={dict.common.searchLabel}
              placeholder={dict.common.searchPlaceholder}
              buttonLabel={dict.common.search}
            />
          </div>
        </Container>
      </section>

      <Container className="space-y-14 py-10 sm:py-14">
        <HowDoI locale={locale} dict={dict} />
        <UpcomingMeetings locale={locale} dict={dict} />
        <div className="grid gap-12 lg:grid-cols-2">
          <LatestNews locale={locale} dict={dict} />
          <UpcomingEvents locale={locale} dict={dict} />
        </div>
        <MayorMessage locale={locale} dict={dict} />
        <EatAndStay locale={locale} dict={dict} />
      </Container>
    </>
  );
}
