import type { Metadata } from "next";
import { HomeView } from "@/components/home-view";

export const metadata: Metadata = { title: "Today — CareCircle" };

export default function HomePage() {
  return <HomeView />;
}
