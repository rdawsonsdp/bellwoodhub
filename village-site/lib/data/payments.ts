import { cacheLife, cacheTag } from "next/cache";
import { hasSupabase, publicSupabase } from "@/lib/supabase/public";
import { placeholderPaymentTypes } from "@/lib/placeholder/payments";
import type { PaymentType } from "@/lib/types";

export async function getPaymentTypes(): Promise<PaymentType[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("payment_types");

  if (!hasSupabase) return placeholderPaymentTypes;
  const { data, error } = await publicSupabase().from("payment_types").select("*").order("sort_order");
  if (error) console.error("getPaymentTypes failed", error.message);
  return (data as PaymentType[] | null) ?? [];
}
