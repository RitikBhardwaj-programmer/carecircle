/** Reads configuration from the environment once, with safe defaults. */

export interface AppConfig {
  appUrl: string;
  sessionSecret: string;
  dataStore: "firestore" | "memory";
  projectId: string | undefined;
  cronInvokerEmail: string | undefined;
  cronDevKey: string | undefined;
  onCloudRun: boolean;
}

export type Env = Readonly<Record<string, string | undefined>>;

export function getConfig(env: Env = process.env): AppConfig {
  const sessionSecret = env.SESSION_SECRET ?? "";
  if (sessionSecret.length < 32) {
    throw new Error("SESSION_SECRET is missing or shorter than 32 characters");
  }
  const onCloudRun = Boolean(env.K_SERVICE);
  return {
    appUrl: (env.APP_URL ?? "http://localhost:3005").replace(/\/$/, ""),
    sessionSecret,
    dataStore: env.DATA_STORE === "memory" ? "memory" : "firestore",
    projectId: env.GOOGLE_CLOUD_PROJECT,
    cronInvokerEmail: env.CRON_INVOKER_EMAIL,
    // The dev key is never accepted on Cloud Run, even if someone sets it by mistake.
    cronDevKey: onCloudRun ? undefined : env.CRON_DEV_KEY || undefined,
    onCloudRun,
  };
}
