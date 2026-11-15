import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CareCircle — Elderly Care & Medication Management",
  description:
    "A shared, passcode-protected care space where elderly people, caretakers and family manage medications, track adherence and monitor doctor appointments.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0b3d91" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
