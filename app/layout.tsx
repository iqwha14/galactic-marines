import "./globals.css";
import type { Metadata } from "next";
import Providers from "./providers";

export const metadata: Metadata = {
  title: "Galactic Marines | Command Deck",
  description: "Galactic Marines Command Interface",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="min-h-screen hud-grid">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
