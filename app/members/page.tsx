"use client";

import { SessionProvider } from "next-auth/react";
import AppShell from "../_components/AppShell";

export default function MembersPage() {
  return (
    <SessionProvider>
      <AppShell defaultTab="members" />
    </SessionProvider>
  );
}
