import type { Alert } from "@/lib/types";

// Sample alert shown when Supabase is not connected, so the banner can be
// seen and tested. TODO(content): staff control the real alert from /admin.
export const placeholderAlerts: Alert[] = [
  {
    id: "placeholder-alert",
    severity: "warning",
    message:
      "Sample alert: a water main repair on Washington Blvd may lower water pressure between 25th and 30th Avenues today.",
    message_es:
      "Alerta de muestra: la reparación de una tubería en Washington Blvd puede reducir la presión del agua entre las avenidas 25 y 30 hoy.",
    link_url: "/community/news",
    is_active: true,
    starts_at: null,
    ends_at: null,
    updated_at: "2026-11-14T00:00:00Z",
  },
];
