import type { Meeting, MeetingType } from "@/lib/types";

// Sample meetings so the homepage and the meetings page have something to
// show before the real archive is imported.
// TODO(content): import the real agendas and minutes (the WordPress site has
// PDFs back to December 2016) and confirm each body's meeting schedule.

export const SAMPLE_PDF = "/sample/sample-document.pdf";

export const placeholderMeetingTypes: MeetingType[] = [
  { id: "mt-board", slug: "village-board", name: "Village Board", name_es: "Junta de la Villa", sort_order: 1 },
  { id: "mt-cow", slug: "committee-of-the-whole", name: "Committee of the Whole", name_es: "Comité Plenario", sort_order: 2 },
  { id: "mt-plan", slug: "plan-commission", name: "Plan Commission", name_es: "Comisión de Planificación", sort_order: 3 },
  { id: "mt-zba", slug: "zoning-board-of-appeals", name: "Zoning Board of Appeals", name_es: "Junta de Apelaciones de Zonificación", sort_order: 4 },
  { id: "mt-pfc", slug: "police-fire-commission", name: "Board of Fire & Police Commissioners", name_es: "Junta de Comisionados de Bomberos y Policía", sort_order: 5 },
];

const HALL = "Village Hall, 3200 Washington Blvd";

/** A date N days from today at 6:00 p.m. Central (stored as UTC). */
function daysFromNow(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(24, 0, 0, 0); // 6 p.m. CST
  return d.toISOString();
}

export function placeholderMeetings(): Meeting[] {
  const [board, cow, plan, zba, pfc] = placeholderMeetingTypes;
  const upcoming: [number, MeetingType, boolean][] = [
    [4, board, true],
    [9, plan, true],
    [16, cow, false],
    [32, board, false],
  ];
  const past: [number, MeetingType][] = [];
  const rotation = [board, cow, plan, board, zba, cow, board, pfc];
  for (let i = 0; i < 40; i++) past.push([-(10 + i * 14), rotation[i % rotation.length]]);

  return [
    ...upcoming.map(([days, type, hasAgenda], i) => ({
      id: `pm-up-${i}`,
      meeting_type_id: type.id,
      title: null,
      title_es: null,
      starts_at: daysFromNow(days),
      location: HALL,
      agenda_url: hasAgenda ? SAMPLE_PDF : null,
      minutes_url: null,
      video_url: null,
      is_cancelled: false,
      meeting_type: type,
    })),
    ...past.map(([days, type], i) => ({
      id: `pm-past-${i}`,
      meeting_type_id: type.id,
      title: null,
      title_es: null,
      starts_at: daysFromNow(days),
      location: HALL,
      agenda_url: SAMPLE_PDF,
      // The most recent meeting's minutes are usually not approved yet.
      minutes_url: i === 0 ? null : SAMPLE_PDF,
      video_url: null,
      is_cancelled: false,
      meeting_type: type,
    })),
  ];
}
