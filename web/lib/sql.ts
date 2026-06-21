/**
 * SQL CASE expression that derives the display "source stream" from a row's
 * topic + sender. Mirrors deriveStream() in lib/topics.ts — keep the two in sync.
 */
export function streamCase(alias = "e"): string {
  const t = `${alias}.topic`;
  const f = `lower(${alias}.from_email)`;
  return `CASE
    WHEN ${t} = 'public_safety' THEN 'Police'
    WHEN ${t} = 'fire_ems' THEN 'Fire/EMS'
    WHEN ${f} LIKE '%illinois-demo.gov' OR ${f} LIKE '%cookcounty-demo.gov' THEN 'Regional'
    WHEN ${f} LIKE '%@bellwood-demo.gov' THEN 'Interdepartmental'
    WHEN ${t} = 'business' THEN 'Business'
    WHEN ${t} = 'foia' THEN 'Civic/FOIA'
    ELSE 'Resident'
  END`;
}
