import { NextResponse } from "next/server";
import { addNewsletterContact, sendEmail } from "@/lib/email";
import { hasServiceSupabase, serviceSupabase } from "@/lib/supabase/service";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Newsletter sign-up: save the address in Supabase, add it to the Resend
// audience and send a welcome email. With no keys set it accepts the sign-up
// and logs it, so the form can be tested locally.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    email?: unknown;
    locale?: unknown;
    website?: unknown;
  } | null;

  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const locale = body?.locale === "es" ? "es" : "en";

  // Bots fill in the hidden "website" field. Pretend it worked.
  if (body?.website) return NextResponse.json({ ok: true });
  if (!emailPattern.test(email) || email.length > 254) {
    return NextResponse.json({ ok: false, error: "invalid_email" }, { status: 400 });
  }

  if (hasServiceSupabase) {
    const { error } = await serviceSupabase()
      .from("subscribers")
      .upsert({ email, locale, list: "newsletter", unsubscribed_at: null }, { onConflict: "email,list" });
    if (error) {
      console.error("newsletter sign-up failed", error.message);
      return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
    }
  }

  await addNewsletterContact(email);
  await sendEmail({
    to: email,
    subject:
      locale === "es" ? "Bienvenido al boletín de la Villa de Bellwood" : "Welcome to the Village of Bellwood newsletter",
    text:
      locale === "es"
        ? "Gracias por inscribirse. Le enviaremos un correo al mes con noticias, eventos y cambios en los servicios de la Villa de Bellwood.\n\nSi no se inscribió, puede ignorar este correo."
        : "Thanks for signing up. We'll send one email a month with news, events and service changes from the Village of Bellwood.\n\nIf you didn't sign up, you can ignore this email.",
  });

  return NextResponse.json({ ok: true });
}
