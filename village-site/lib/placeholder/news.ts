import type { EventItem, NewsItem } from "@/lib/types";

// Sample news and events.
// TODO(content): import the real posts and events from the WordPress site
// (412 posts and 637 events in its sitemap) and delete these samples.

function daysFromNow(days: number, hourUtc = 16): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hourUtc, 0, 0, 0);
  return d.toISOString();
}

const news = (
  n: number,
  daysAgo: number,
  slug: string,
  title: string,
  title_es: string,
  summary: string,
  summary_es: string,
  body: string,
): NewsItem => ({
  id: `pn-${n}`,
  slug,
  title,
  title_es,
  summary,
  summary_es,
  body,
  body_es: null,
  image_url: null,
  image_alt: null,
  image_alt_es: null,
  department_id: null,
  is_published: true,
  published_at: daysFromNow(-daysAgo),
});

export function placeholderNews(): NewsItem[] {
  return [
    news(
      1, 1, "leaf-collection-schedule",
      "Leaf collection runs through the first week of December",
      "La recolección de hojas continúa hasta la primera semana de diciembre",
      "Rake leaves to the curb, not into the street, by 7 a.m. on your regular trash day.",
      "Lleve las hojas al borde de la acera, no a la calle, antes de las 7 a.m. en su día regular de basura.",
      "Sample article. Public Works crews collect leaves on your regular trash day.\n\nRake leaves to the curb, not into the street, so storm drains stay clear. Please keep branches and trash out of leaf piles.\n\nQuestions? Call Public Works through Village Hall at (708) 547-3500.",
    ),
    news(
      2, 5, "vehicle-stickers-on-sale",
      "Vehicle stickers are on sale now",
      "Las calcomanías de vehículos ya están a la venta",
      "Buy online or at Village Hall. Have your license plate number and renewal notice ready.",
      "Compre en línea o en la Alcaldía. Tenga a mano su número de placa y su aviso de renovación.",
      "Sample article. Every vehicle registered to a Bellwood address needs a village sticker.\n\nYou can buy yours online through the Village's payment portal or in person at Village Hall during business hours.",
    ),
    news(
      3, 9, "holiday-hours",
      "Village Hall holiday hours",
      "Horario de la Alcaldía durante los días festivos",
      "Village Hall will be closed on Thanksgiving Day and the day after. Trash pickup moves back one day.",
      "La Alcaldía estará cerrada el Día de Acción de Gracias y el día siguiente. La recolección de basura se retrasa un día.",
      "Sample article. Village Hall will be closed on Thanksgiving Day and the day after.\n\nPolice and fire services are not affected. Online payments are available at any time.",
    ),
    news(
      4, 16, "property-tax-appeal-forum",
      "Virtual property tax appeal forum",
      "Foro virtual sobre apelaciones de impuestos a la propiedad",
      "Learn how to appeal your property tax assessment at a free online session.",
      "Aprenda a apelar la tasación de su propiedad en una sesión gratuita en línea.",
      "Sample article. Join a free online session to learn how to appeal your property tax assessment.",
    ),
    news(
      5, 24, "winter-parking-rules",
      "Winter parking rules start December 1",
      "Las reglas de estacionamiento de invierno comienzan el 1 de diciembre",
      "When two inches of snow fall, move your car off the street so plows can clear it.",
      "Cuando caigan dos pulgadas de nieve, retire su auto de la calle para que pasen las quitanieves.",
      "Sample article. When two or more inches of snow fall, parking is not allowed on village streets until they are plowed.",
    ),
  ];
}

const event = (
  n: number,
  days: number,
  slug: string,
  title: string,
  title_es: string,
  location: string,
  description: string,
  hourUtc = 16,
  hours = 2,
): EventItem => {
  const starts_at = daysFromNow(days, hourUtc);
  return {
    id: `pe-${n}`,
    slug,
    title,
    title_es,
    description,
    description_es: null,
    location,
    starts_at,
    ends_at: new Date(new Date(starts_at).getTime() + hours * 3600_000).toISOString(),
    is_all_day: false,
    image_url: null,
    image_alt: null,
    is_published: true,
  };
};

export function placeholderEvents(): EventItem[] {
  return [
    event(1, 6, "senior-luncheon", "Senior luncheon", "Almuerzo para adultos mayores", "Bellwood Community Center", "Sample event. A free lunch and social hour for Bellwood residents 60 and older. Please reserve a seat by calling Village Hall.", 18),
    event(2, 13, "holiday-tree-lighting", "Holiday tree lighting", "Encendido del árbol navideño", "Village Hall, 3200 Washington Blvd", "Sample event. Join your neighbors for music, hot chocolate and the lighting of the village tree.", 23),
    event(3, 21, "breakfast-with-santa", "Breakfast with Santa", "Desayuno con Santa", "Bellwood Community Center", "Sample event. Pancakes, photos and a small gift for every child. Tickets are limited.", 15, 3),
    event(4, 35, "teen-zone-game-night", "Teen Zone game night", "Noche de juegos para jóvenes", "Bellwood Community Center", "Sample event. Games, pizza and music for Bellwood teens ages 13 to 18.", 23, 3),
    event(5, -12, "veterans-day-ceremony", "Veterans Day ceremony", "Ceremonia del Día de los Veteranos", "Memorial Park", "Sample event. A ceremony honoring Bellwood's veterans.", 17, 1),
  ];
}
