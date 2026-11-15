import type { Metadata } from "next";
import Link from "next/link";
import { DoseConfirm } from "@/components/dose-confirm";
import { describeDoseLink } from "@/lib/services/reminders";
import { getDeps } from "@/lib/server/container";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Confirm dose — CareCircle", robots: { index: false, follow: false } };

/**
 * One-tap page from the reminder email. Viewing it (GET) changes nothing; only the button (POST) marks the dose.
 */
export default async function DosePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let info: { elderName: string; medication: string; time: string } | null = null;
  try {
    const d = await describeDoseLink(await getDeps(), decodeURIComponent(token));
    info = { elderName: d.elderName, medication: d.medication, time: d.time };
  } catch {
    info = null;
  }
  return (
    <main id="main" className="container narrow elder-mode-page">
      <h1>Confirm a dose</h1>
      {info ? (
        <DoseConfirm token={token} elderName={info.elderName} medication={info.medication} time={info.time} />
      ) : (
        <p role="alert" className="big-text">
          This link has expired or is not valid. Please open CareCircle and mark the dose there.
        </p>
      )}
      <p>
        <Link href="/">Open CareCircle</Link>
      </p>
    </main>
  );
}
