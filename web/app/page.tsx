import { redirect } from "next/navigation";

// The front door is the Chief of Staff desktop UX (the Claude Design prototype,
// ported into components/chief/ChiefApp.tsx). The older marketing "Village
// Knowledge Hub" landing is still available at components/landing.tsx if needed.
export default function Page() {
  redirect("/chief");
}
