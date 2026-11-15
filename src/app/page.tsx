import { redirect } from "next/navigation";
import { Landing } from "@/components/landing";
import { getServerSession } from "@/lib/server/session";

export const dynamic = "force-dynamic";

const FEATURES = [
  ["Secure, passcode-based access", "Each family member and caretaker gets their own passcode. The elder can revoke it at any time."],
  ["Medication schedules and adherence", "Add, edit and manage medicines. Mark doses as taken and see 7-day and 30-day adherence."],
  ["Proactive email reminders", "Emails for upcoming doses, missed medications and doctor appointments, with a one-tap “Mark as taken” link."],
  ["Elder Mode", "Large text, high contrast, one big button per dose, read-aloud and Hindi."],
  ["Gemini prescription scan", "Photograph a prescription to get a draft schedule. Nothing is saved until a person confirms it."],
];

export default async function Home() {
  if (await getServerSession()) redirect("/home");
  return (
    <main id="main" className="container landing">
      <header className="hero">
        <p className="brand">
          <span aria-hidden="true">💙</span> CareCircle
        </p>
        <h1>Elderly care &amp; medication management, shared with the people who care.</h1>
        <p className="lead">
          A shared space where elderly individuals, caretakers and family members manage daily medications, medical
          appointments and healthcare routines — with the elder at the centre of every decision.
        </p>
      </header>
      <Landing />
      <section aria-labelledby="features-title" className="features">
        <h2 id="features-title">What CareCircle does</h2>
        <ul className="feature-list">
          {FEATURES.map(([title, text]) => (
            <li key={title}>
              <h3>{title}</h3>
              <p>{text}</p>
            </li>
          ))}
        </ul>
      </section>
      <footer className="footer">
        <p>CareCircle does not give medical advice. Always follow your doctor or pharmacist.</p>
      </footer>
    </main>
  );
}
