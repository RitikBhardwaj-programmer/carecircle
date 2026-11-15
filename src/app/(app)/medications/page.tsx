import type { Metadata } from "next";
import { MedicationsView } from "@/components/medications-view";

export const metadata: Metadata = { title: "Medications — CareCircle" };

export default function MedicationsPage() {
  return <MedicationsView />;
}
