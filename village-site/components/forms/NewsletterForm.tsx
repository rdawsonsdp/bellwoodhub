"use client";

import { useId, useState, type FormEvent } from "react";

type Status = "idle" | "sending" | "success" | "invalid" | "error";

// The newsletter sign-up in the footer. The current site's button goes
// nowhere; this one posts to /api/newsletter, which saves the address and
// sends a welcome email through Resend.
export function NewsletterForm({
  locale,
  labels,
}: {
  locale: string;
  labels: {
    emailLabel: string;
    subscribe: string;
    subscribing: string;
    subscribeSuccess: string;
    subscribeInvalid: string;
    subscribeError: string;
  };
}) {
  const [status, setStatus] = useState<Status>("idle");
  const id = useId();
  const messageId = `${id}-message`;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const email = String(data.get("email") ?? "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setStatus("invalid");
      return;
    }
    setStatus("sending");
    try {
      const response = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // "website" is a hidden field real people leave empty; bots fill it in.
        body: JSON.stringify({ email, locale, website: data.get("website") }),
      });
      if (response.ok) {
        form.reset();
        setStatus("success");
      } else {
        setStatus(response.status === 400 ? "invalid" : "error");
      }
    } catch {
      setStatus("error");
    }
  }

  const message =
    status === "success"
      ? labels.subscribeSuccess
      : status === "invalid"
        ? labels.subscribeInvalid
        : status === "error"
          ? labels.subscribeError
          : "";

  return (
    <form onSubmit={onSubmit} noValidate className="mt-3">
      <label htmlFor={`${id}-email`} className="block font-semibold">
        {labels.emailLabel}
      </label>
      <div className="mt-1 flex max-w-md flex-col gap-2 sm:flex-row">
        <input
          id={`${id}-email`}
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={status === "invalid"}
          aria-describedby={message ? messageId : undefined}
          className="h-12 min-w-0 flex-1 rounded-lg border-2 border-white bg-white px-3 text-base text-ink"
        />
        <div aria-hidden="true" className="hidden">
          <label>
            Website
            <input name="website" type="text" tabIndex={-1} autoComplete="off" />
          </label>
        </div>
        <button
          type="submit"
          disabled={status === "sending"}
          className="h-12 rounded-lg bg-gold-400 px-5 text-base font-bold text-navy-950 hover:bg-gold-500 disabled:opacity-70"
        >
          {status === "sending" ? labels.subscribing : labels.subscribe}
        </button>
      </div>
      <p id={messageId} role="status" aria-live="polite" className="mt-2 min-h-6 font-semibold text-gold-400">
        {message}
      </p>
    </form>
  );
}
