import type { Metadata } from "next";
import { AppointmentsView } from "@/components/appointments-view";

export const metadata: Metadata = { title: "Appointments — CareCircle" };

export default function AppointmentsPage() {
  return <AppointmentsView />;
}
