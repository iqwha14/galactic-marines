"use client";

import { SessionProvider } from "next-auth/react";
import AppShell from "../_components/AppShell";

export default function OpsPage() {
  return (
    <SessionProvider>
      <AppShell defaultTab="ops" />
    </SessionProvider>
  );
}
