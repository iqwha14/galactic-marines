export type Role = "viewer" | "editor";

export function roleFromCode(codeRaw: string | null | undefined): Role {
  const code = (codeRaw ?? "").trim();
  if (!code) return "viewer";

  const editor = (process.env.GM_EDITOR_CODE ?? "").trim();
  if (editor && code === editor) return "editor";

  return "viewer";
}

export function requireAtLeast(role: Role, needed: Role): boolean {
  const order: Role[] = ["viewer", "editor"];
  return order.indexOf(role) >= order.indexOf(needed);
}
