"use client";

import { useEffect, useId, useState } from "react";
import { THEME_KEY } from "@/lib/theme-boot";

export type ThemeChoice = "system" | "light" | "dark";

function readChoice(): ThemeChoice {
  try {
    const saved = window.localStorage.getItem(THEME_KEY);
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch {
    return "system";
  }
}

function apply(choice: ThemeChoice): void {
  const dark =
    choice === "dark" || (choice === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
}

/** Theme choice (System / Light / Dark), saved on this device and applied on <html>. */
export function useTheme(): [ThemeChoice, (c: ThemeChoice) => void] {
  const [choice, setChoice] = useState<ThemeChoice>("system");
  useEffect(() => {
    // Reading browser storage must happen after hydration, so this runs in an effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChoice(readChoice());
  }, []);
  useEffect(() => {
    if (choice !== "system") return;
    // "System" follows the operating system live, e.g. when it switches to dark at night.
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [choice]);
  const update = (c: ThemeChoice) => {
    setChoice(c);
    try {
      window.localStorage.setItem(THEME_KEY, c);
    } catch {
      /* storage blocked: the choice lasts for this visit */
    }
    apply(c);
  };
  return [choice, update];
}

/** Labelled theme select; labels come from the caller so they follow the current language. */
export function ThemeSelect({
  labels,
}: {
  labels: { theme: string; system: string; light: string; dark: string };
}) {
  const id = useId();
  const [choice, setChoice] = useTheme();
  return (
    <span className="select-group">
      <label htmlFor={id} className="select-label">
        {labels.theme}
      </label>
      <select
        id={id}
        value={choice}
        onChange={(e) =>
          setChoice(e.target.value === "light" || e.target.value === "dark" ? e.target.value : "system")
        }
      >
        <option value="system">{labels.system}</option>
        <option value="light">{labels.light}</option>
        <option value="dark">{labels.dark}</option>
      </select>
    </span>
  );
}
