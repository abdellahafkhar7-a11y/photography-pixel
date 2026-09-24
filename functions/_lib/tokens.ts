const TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,64}$/

const BASE64URL_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

// URL-safe base64 WITHOUT padding. 16 bytes -> 22 characters, so tokens always
// satisfy the 20-64 character format check.
export function bytesToBase64Url(bytes: Uint8Array): string {
  let out = ''
  const len = bytes.length
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i]!
    const rem = len - i
    const b1 = rem > 1 ? bytes[i + 1]! : 0
    const b2 = rem > 2 ? bytes[i + 2]! : 0
    out += BASE64URL_ALPHABET[b0 >> 2] ?? ''
    out += BASE64URL_ALPHABET[((b0 & 0x03) << 4) | (b1 >> 4)] ?? ''
    if (rem > 1) out += BASE64URL_ALPHABET[((b1 & 0x0f) << 2) | (b2 >> 6)] ?? ''
    if (rem > 2) out += BASE64URL_ALPHABET[b2 & 0x3f] ?? ''
  }
  return out
}

// 16 cryptographically secure random bytes => 128 bits of entropy, encoded as
// a URL-safe token (base64url, no padding). The token is the *only* value
// placed in the private URL; it is never stored in the database.
export function generatePrivateToken(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return bytesToBase64Url(bytes)
}

export function isValidTokenFormat(token: string): boolean {
  return TOKEN_PATTERN.test(token)
}

const HEX = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f']

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', data)
  const bytes = new Uint8Array(digest)
  let out = ''
  for (const byte of bytes) {
    out += HEX[byte >> 4] ?? ''
    out += HEX[byte & 0x0f] ?? ''
  }
  return out
}

export async function hashPrivateToken(token: string): Promise<string> {
  return sha256Hex(token)
}

// Constant-time string equality (avoids early-exit timing leaks on secrets).
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) {
    diff |= (a.charCodeAt(i) ?? 0) ^ (b.charCodeAt(i) ?? 0)
  }
  return diff === 0
}

export function randomId(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return bytesToBase64Url(bytes)
}