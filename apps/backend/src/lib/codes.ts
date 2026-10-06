const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function confirmationCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  let code = ''
  for (const byte of bytes) code += alphabet[byte % alphabet.length]
  return code
}
