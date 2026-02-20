export function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export function trelloBaseParams() {
  const key = requiredEnv("TRELLO_KEY");
  const token = requiredEnv("TRELLO_TOKEN");
  return { key, token };
}
