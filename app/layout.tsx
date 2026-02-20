import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Galactic Marines | Training Dashboard",
  description: "Clone Wars RP – Ränge, Fortbildungen, Medaillen, Logs (Trello)",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="min-h-screen hud-grid">{children}</body>
    </html>
  );
}
