import Link from "next/link";
import type { Dictionary } from "@/lib/dictionaries";
import { formatDate, localePath, pick, type Locale } from "@/lib/i18n";
import { getUpcomingMeetings } from "@/lib/data/meetings";
import { getNews, getUpcomingEvents } from "@/lib/data/news";
import { site } from "@/lib/site";
import { DateBadge } from "@/components/ui/DateBadge";
import { ExternalLink } from "@/components/ui/ExternalLink";
import { Icon } from "@/components/ui/Icon";

type Props = { locale: Locale; dict: Dictionary };

const h2 = "text-2xl font-bold text-navy-900 sm:text-3xl";
const moreLink = "prose-link inline-flex min-h-11 items-center gap-1.5 font-semibold";
const timeOnly: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
const dayAndDate: Intl.DateTimeFormatOptions = { weekday: "long", month: "long", day: "numeric" };

export async function UpcomingMeetings({ locale, dict }: Props) {
  const meetings = await getUpcomingMeetings(3);
  const t = dict.home;

  return (
    <section aria-labelledby="home-meetings">
      <h2 id="home-meetings" className={h2}>
        {t.meetingsTitle}
      </h2>
      <p className="mt-1 text-ink-2">{t.meetingsIntro}</p>
      {meetings.length === 0 ? (
        <p className="mt-4">{t.noMeetings}</p>
      ) : (
        <ul className="mt-5 grid gap-4 md:grid-cols-3">
          {meetings.map((meeting) => {
            const typeName = pick(locale, meeting.meeting_type.name, meeting.meeting_type.name_es);
            const date = formatDate(locale, meeting.starts_at, dayAndDate);
            return (
              <li key={meeting.id} className="flex flex-col rounded-xl border-2 border-line bg-white p-4">
                <div className="flex gap-4">
                  <DateBadge locale={locale} iso={meeting.starts_at} />
                  <div>
                    <h3 className="text-lg font-bold leading-snug text-navy-900">{typeName}</h3>
                    <p className="text-ink-2">
                      {date}, {formatDate(locale, meeting.starts_at, timeOnly)}
                    </p>
                    {meeting.location && <p className="text-sm text-ink-3">{meeting.location}</p>}
                  </div>
                </div>
                <p className="mt-3 border-t border-line pt-2">
                  {meeting.agenda_url ? (
                    <a href={meeting.agenda_url} className={moreLink}>
                      <Icon name="document" size={18} />
                      <span>
                        {t.agenda}
                        <span className="sr-only">
                          {" "}
                          {t.forMeeting} {typeName} {t.meetingOn} {date}
                        </span>{" "}
                        ({t.pdf})
                      </span>
                    </a>
                  ) : (
                    <span className="inline-flex min-h-11 items-center text-ink-3">{t.agendaPending}</span>
                  )}
                </p>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-3">
        <Link href={localePath(locale, "/government/meetings")} className={moreLink}>
          {t.allMeetings}
          <Icon name="arrowRight" size={18} />
        </Link>
      </p>
    </section>
  );
}

export async function LatestNews({ locale, dict }: Props) {
  const news = await getNews(3);
  const t = dict.home;

  return (
    <section aria-labelledby="home-news">
      <h2 id="home-news" className={h2}>
        {t.newsTitle}
      </h2>
      {news.length === 0 ? (
        <p className="mt-4">{t.noNews}</p>
      ) : (
        <ul className="mt-4 divide-y divide-line border-y border-line">
          {news.map((item) => (
            <li key={item.id} className="py-4">
              <p className="text-sm text-ink-3">
                <time dateTime={item.published_at}>{formatDate(locale, item.published_at)}</time>
              </p>
              <h3 className="text-lg font-bold leading-snug">
                <Link href={localePath(locale, `/community/news/${item.slug}`)} className="prose-link">
                  {pick(locale, item.title, item.title_es)}
                </Link>
              </h3>
              <p className="mt-1 text-ink-2">{pick(locale, item.summary, item.summary_es)}</p>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2">
        <Link href={localePath(locale, "/community/news")} className={moreLink}>
          {t.allNews}
          <Icon name="arrowRight" size={18} />
        </Link>
      </p>
    </section>
  );
}

export async function UpcomingEvents({ locale, dict }: Props) {
  const events = await getUpcomingEvents(3);
  const t = dict.home;

  return (
    <section aria-labelledby="home-events">
      <h2 id="home-events" className={h2}>
        {t.eventsTitle}
      </h2>
      {events.length === 0 ? (
        <p className="mt-4">{t.noEvents}</p>
      ) : (
        <ul className="mt-4 divide-y divide-line border-y border-line">
          {events.map((event) => (
            <li key={event.id} className="flex gap-4 py-4">
              <DateBadge locale={locale} iso={event.starts_at} />
              <div>
                <h3 className="text-lg font-bold leading-snug">
                  <Link href={localePath(locale, `/community/events/${event.slug}`)} className="prose-link">
                    {pick(locale, event.title, event.title_es)}
                  </Link>
                </h3>
                <p className="text-ink-2">
                  {formatDate(locale, event.starts_at, dayAndDate)}
                  {!event.is_all_day && `, ${formatDate(locale, event.starts_at, timeOnly)}`}
                </p>
                {event.location && <p className="text-sm text-ink-3">{event.location}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2">
        <Link href={localePath(locale, "/community/events")} className={moreLink}>
          {t.allEvents}
          <Icon name="arrowRight" size={18} />
        </Link>
      </p>
    </section>
  );
}

export function MayorMessage({ locale, dict }: Props) {
  const t = dict.home;
  return (
    <section aria-labelledby="home-mayor" className="rounded-2xl border-l-8 border-gold-500 bg-paper p-6 sm:p-8">
      <h2 id="home-mayor" className={h2}>
        {t.mayorTitle}
      </h2>
      {/* TODO(content): replace this sample message with the Mayor's own words, confirm
          the Mayor's name and title, and add an official portrait with alt text. */}
      <div className="mt-3 max-w-3xl space-y-3 text-lg text-ink-2">
        {t.mayorBody.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
      <p className="mt-4 font-bold text-navy-900">{t.mayorName}</p>
      <p>
        <Link href={localePath(locale, "/government/mayor")} className={moreLink}>
          {t.mayorLink}
          <Icon name="arrowRight" size={18} />
        </Link>
      </p>
    </section>
  );
}

export function EatAndStay({ dict }: Props) {
  const t = dict.home;
  return (
    <section aria-labelledby="home-eat" className="on-dark rounded-2xl bg-navy-800 p-6 text-white sm:p-8">
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div className="flex gap-4">
          <span className="hidden h-14 w-14 shrink-0 place-items-center rounded-full bg-gold-400 text-navy-950 sm:grid">
            <Icon name="fork" size={28} />
          </span>
          <div>
            <h2 id="home-eat" className="text-2xl font-bold sm:text-3xl">
              {t.eatTitle}
            </h2>
            <p className="mt-1 max-w-xl text-navy-100">{t.eatBody}</p>
          </div>
        </div>
        {/* TODO(content): site.eatInBellwoodUrl is a placeholder until the real portal address is supplied. */}
        <ExternalLink
          href={site.eatInBellwoodUrl}
          newTabLabel={dict.common.opensNewTab}
          className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-lg bg-gold-400 px-5 text-center font-bold text-navy-950 hover:bg-gold-500"
        >
          {t.eatButton}
        </ExternalLink>
      </div>
    </section>
  );
}
