// Facts about the Village that appear on every page (footer, contact, metadata).
// Anything marked TODO needs to be confirmed by village staff — see TODO-CONTENT.md.

export const site = {
  name: "Village of Bellwood",
  state: "Illinois",
  // TODO(content): replace with the production domain once hosting is agreed.
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3300",
  villageHall: {
    street: "3200 Washington Blvd",
    cityStateZip: "Bellwood, IL 60104",
    phone: "(708) 547-3500",
    phoneHref: "tel:+17085473500",
    mapUrl: "https://www.google.com/maps/search/?api=1&query=3200+Washington+Blvd+Bellwood+IL+60104",
    // Hours are stored as data so the footer, contact page and department
    // pages can never disagree (they do on the current site).
    hours: [
      { days: "weekdays", opens: "9:00", closes: "17:00" },
      { days: "saturday", opens: "9:00", closes: "12:00" },
    ],
  },
  emergency: {
    emergencyNumber: "911",
    // TODO(content): add the real police and fire non-emergency numbers. Until
    // then these show the Village Hall main line so nobody dials a made-up number.
    policeNonEmergency: { display: "(708) 547-3500", href: "tel:+17085473500", placeholder: true },
    fireNonEmergency: { display: "(708) 547-3500", href: "tel:+17085473500", placeholder: true },
    // TODO(content): confirm the after-hours water / public works emergency number.
    waterEmergency: { display: "(708) 547-3500", href: "tel:+17085473500", placeholder: true },
  },
  // TODO(content): confirm each official social media account URL.
  social: [
    { name: "Facebook", href: "https://www.facebook.com/", placeholder: true },
    { name: "Instagram", href: "https://www.instagram.com/", placeholder: true },
    { name: "X", href: "https://x.com/", placeholder: true },
    { name: "YouTube", href: "https://www.youtube.com/", placeholder: true },
  ],
  // TODO(content): replace with the real Eat in Bellwood portal address.
  eatInBellwoodUrl: process.env.NEXT_PUBLIC_EAT_IN_BELLWOOD_URL ?? "https://example.com/eat-in-bellwood",
  ordinancesUrl: "https://codelibrary.amlegal.com/",
} as const;
