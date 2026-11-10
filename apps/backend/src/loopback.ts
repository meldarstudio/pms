const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

export function loopbackUrl(value: string | undefined) {
  if (!value || !URL.canParse(value)) return undefined;
  return LOOPBACK_HOSTS.has(new URL(value).hostname) ? value.replace(/\/$/, "") : undefined;
}
