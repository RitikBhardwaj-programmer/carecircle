import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { SessionProvider } from "@/components/session-context";
import { getServerSession } from "@/lib/server/session";

export const dynamic = "force-dynamic";

/** Every page in this group needs a valid session; a revoked member is sent back to the login page. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  if (!session) redirect("/");
  return (
    <SessionProvider value={session}>
      <AppShell>{children}</AppShell>
    </SessionProvider>
  );
}
