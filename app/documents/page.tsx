"use client";

import { SessionProvider } from "next-auth/react";
import AppShell from "../_components/AppShell";

export default function DocumentsPage() {
  return (
    <SessionProvider>
      <AppShell defaultTab="docs" />
    </SessionProvider>
  );
}
