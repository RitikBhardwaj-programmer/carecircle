"use client";

import { useEffect, useState } from "react";
import { speechLang } from "@/lib/i18n";
import type { Language } from "@/lib/domain/types";

/** Reads text aloud with the browser Speech Synthesis API. Hidden if the browser lacks it. */
export function ReadAloudButton({
  text,
  lang,
  label,
  stopLabel,
}: {
  text: string;
  lang: Language;
  label: string;
  stopLabel: string;
}) {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    // Feature detection must run in the browser after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(typeof window !== "undefined" && "speechSynthesis" in window);
    return () => {
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
      setSpeaking(false);
    };
  }, [text, lang]);

  if (!supported) return null;

  function toggle() {
    const synth = window.speechSynthesis;
    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = speechLang(lang);
    u.rate = 0.9;
    u.onend = () => setSpeaking(false);
    synth.cancel();
    synth.speak(u);
    setSpeaking(true);
  }

  return (
    <button type="button" className="btn btn-secondary" onClick={toggle} aria-pressed={speaking}>
      <span aria-hidden="true">🔊</span> {speaking ? stopLabel : label}
    </button>
  );
}
