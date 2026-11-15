export const dynamic = "force-dynamic";

/** Liveness check for Cloud Run and uptime monitors. Exposes no configuration details. */
export function GET(): Response {
  return Response.json({ status: "ok", service: "carecircle", time: new Date().toISOString() });
}
