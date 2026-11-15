import type { Metadata } from "next";
import { CircleView } from "@/components/circle-view";

export const metadata: Metadata = { title: "Care circle — CareCircle" };

export default function CirclePage() {
  return <CircleView />;
}
