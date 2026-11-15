import type { Metadata, Viewport } from "next";
import "./globals.css";
import { THEME_BOOT_SCRIPT } from "@/lib/theme-boot";

export const metadata: Metadata = {
  title: "CareCircle — Elderly Care & Medication Management",
  description:
    "A shared, passcode-protected care space where elderly people, caretakers and family manage medications, track adherence and monitor doctor appointments.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0b3d91" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // data-theme is set by the boot script before React hydrates, so React must not warn about it.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>
        <a className="skip-link" href="#main">
          Skip to main content · मुख्य सामग्री पर जाएँ
        </a>
        {children}
      </body>
    </html>
  );
}
