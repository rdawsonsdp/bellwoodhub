# Content the Village still needs to supply

Every item here is marked in the code with a `TODO(content)` comment. Search
the project for that phrase to find the exact spot.

## Site-wide

| What is needed | Where it is used | File |
|---|---|---|
| Official village seal or logo (SVG) | Header, replaces the "B" monogram | `components/layout/Header.tsx` |
| Official brand colors, if different from the Mayor's Brief navy and gold | Whole site | `app/globals.css` |
| Police non-emergency phone number | Footer (shows the Village Hall main line for now) | `lib/site.ts` |
| Fire non-emergency phone number | Footer (shows the Village Hall main line for now) | `lib/site.ts` |
| After-hours water / public works emergency number | Footer | `lib/site.ts` |
| Official social media account links (Facebook, Instagram, X, YouTube) | Footer | `lib/site.ts` |
| Eat in Bellwood portal address | Homepage strip | `lib/site.ts` |
| Production domain | Metadata, email links | `lib/site.ts` |
| "From" email address on a verified village domain | All outgoing email | `lib/email.ts` |
| Review of the Spanish translation by a fluent staff member | Menus, buttons, labels | `lib/dictionaries/es.ts` |
| Real alert text (staff post it from /admin) | Alert banner sample | `lib/placeholder/alerts.ts` |

## Homepage

| What is needed | Where it is used | File |
|---|---|---|
| The Mayor's own welcome message, confirmed name and title, and an official portrait with alt text | "A message from the Mayor" | `components/home/HomeSections.tsx`, `lib/dictionaries/*.ts` |
| Real meetings, agendas and minutes (WordPress has PDFs back to Dec 2016) and each body's meeting schedule | "Upcoming meetings" | `lib/placeholder/meetings.ts` |
| Real news posts and events (412 posts, 637 events on the old site) | "Latest news", "Upcoming events" | `lib/placeholder/news.ts` |

## Pay a bill

| What is needed | Where it is used | File |
|---|---|---|
| Each payment vendor's official name, and what residents need to have ready | Payment cards | `lib/placeholder/payments.ts` |
| Which bills can be paid at Village Hall, accepted payment methods, drop box or mailing address | "Prefer to pay in person?" | `app/[locale]/services/pay-a-bill/page.tsx` |

## Pages not written yet

Every menu link that does not have its own page yet shows a "This page is
being written" notice (`app/[locale]/[...rest]/page.tsx`). This list shrinks
as each build step lands.
