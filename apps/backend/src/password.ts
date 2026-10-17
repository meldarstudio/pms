const ITERATIONS = 100_000;
const SCHEME = "pbkdf2-sha256";

// The stored hash avoids "$" so dotenv-style files and shells do not expand it.
function toBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function fromBase64Url(value: string): Uint8Array {
  return Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), (char) =>
    char.charCodeAt(0),
  );
}

async function derive(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i]! ^ b[i]!;
  return difference === 0;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, ITERATIONS);
  return [SCHEME, ITERATIONS, toBase64Url(salt), toBase64Url(hash)].join(":");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iterations, salt, hash] = stored.split(":");
  const count = Number(iterations);
  if (scheme !== SCHEME || !Number.isInteger(count) || count < 1 || !salt || !hash) return false;
  try {
    const actual = await derive(password, fromBase64Url(salt), count);
    return constantTimeEqual(actual, fromBase64Url(hash));
  } catch {
    return false;
  }
}

export async function matchesText(a: string, b: string): Promise<boolean> {
  const encode = (value: string) =>
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  const [left, right] = await Promise.all([encode(a), encode(b)]);
  return constantTimeEqual(new Uint8Array(left), new Uint8Array(right));
}
