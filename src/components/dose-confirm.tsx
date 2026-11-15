"use client";

import { useState } from "react";
import { api } from "./api";

export function DoseConfirm({ token, elderName, medication, time }: { token: string; elderName: string; medication: string; time: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function confirm() {
    setState("busy");
    try {
      await api("/api/dose-link", { method: "POST", body: { token: decodeURIComponent(token) } });
      setState("done");
      setMessage(`Marked as taken: ${medication} at ${time}. Thank you!`);
    } catch (e) {
      setState("error");
      setMessage((e as Error).message);
    }
  }

  return (
    <div className="card dose-card-large">
      <p className="big-text">
        {elderName}: <strong>{medication}</strong> at <strong>{time}</strong>
      </p>
      {state !== "done" ? (
        <button type="button" className="btn btn-primary btn-big btn-block" onClick={() => void confirm()} disabled={state === "busy"}>
          {state === "busy" ? "Saving…" : "Yes, it was taken"}
        </button>
      ) : null}
      <p role="status" aria-live="polite" className="big-text">
        {state === "done" ? <span aria-hidden="true">✓ </span> : null}
        {message}
      </p>
    </div>
  );
}
