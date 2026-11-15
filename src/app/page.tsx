import { redirect } from "next/navigation";
import { Landing } from "@/components/landing";
import { getServerSession } from "@/lib/server/session";

export const dynamic = "force-dynamic";

/** Public front page. A logged-in member goes straight to Today. Text and language live in <Landing>. */
export default async function Home() {
  if (await getServerSession()) redirect("/home");
  return (
    <main id="main" className="container landing">
      <Landing />
    </main>
  );
}
