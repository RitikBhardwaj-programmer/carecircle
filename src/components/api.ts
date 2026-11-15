/** Small typed fetch wrapper for the browser. Errors carry the server message and field errors. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? "GET",
    headers: init.body === undefined ? undefined : { "content-type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    credentials: "same-origin",
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as { error?: { message?: string; fields?: Record<string, string> } };
  if (!res.ok) {
    // Session expired or revoked: reload the login page.
    if (res.status === 401 && path !== "/api/auth/login") window.location.replace(new URL("/", window.location.origin).href);
    throw new ApiError(data.error?.message ?? "Request failed.", res.status, data.error?.fields);
  }
  return data as T;
}

/** Formats an ISO instant in the profile time zone. */
export function formatDateTime(iso: string, timeZone: string, lang: "en" | "hi" = "en"): string {
  return new Intl.DateTimeFormat(lang === "hi" ? "hi-IN" : "en-IN", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
