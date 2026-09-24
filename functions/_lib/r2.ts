import type { DeliveryEnv } from './env'

export function sanitizeFileName(filename: string | null): string {
  if (!filename) return 'original.mp4'
  const base = filename.split(/[\\/]/).pop() ?? 'original.mp4'
  const cleaned = base.replace(/[^\w.\- ()]/g, '_').trim()
  return cleaned.length > 0 && !cleaned.startsWith('.') ? cleaned : 'original.mp4'
}

// Versioned object keys. Every version has its own namespace, so cleanup of an
// older version's original can never touch a newer replacement's objects.
export function originalKey(deliveryId: string, version: number, filename: string | null): string {
  return `originals/${deliveryId}/${version}/${sanitizeFileName(filename)}`
}

export function previewKey(deliveryId: string, version: number): string {
  return `previews/${deliveryId}/${version}/preview_watermarked.mp4`
}

export function thumbKey(deliveryId: string, version: number): string {
  return `thumbs/${deliveryId}/${version}/cover.jpg`
}

//----------------------------------------------------------------------------
// Short-lived presigned R2 URLs (AWS SigV4, S3 API against R2's endpoint).
//
// Presigning is opt-in: it activates only when R2_ACCESS_KEY_ID,
// R2_SECRET_ACCESS_KEY and R2_ENDPOINT are present in the environment. Every
// call site still enforces the same server-side token/status authorization
// before it ever asks for a URL. When the credentials are not configured (for
// example in local `wrangler pages dev` with the simulated bucket), callers
// fall back to streaming the object through the authorized function instead.
//----------------------------------------------------------------------------

const HEX = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f']

async function sha256Hex(input: Uint8Array | string): Promise<string> {
  const data = typeof input === 'string' ? new TextEncoder().encode(input) : input
  const digest = await crypto.subtle.digest('SHA-256', data)
  const bytes = new Uint8Array(digest)
  let out = ''
  for (const byte of bytes) {
    out += HEX[byte >> 4] ?? ''
    out += HEX[byte & 0x0f] ?? ''
  }
  return out
}

async function hmacSha256(key: Uint8Array | string, message: Uint8Array | string): Promise<string> {
  const keyData = typeof key === 'string' ? new TextEncoder().encode(key) : key
  const msgData = typeof message === 'string' ? new TextEncoder().encode(message) : message
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, msgData)
  const bytes = new Uint8Array(signature)
  let out = ''
  for (const byte of bytes) {
    out += HEX[byte >> 4] ?? ''
    out += HEX[byte & 0x0f] ?? ''
  }
  return out
}

function uriEncodeSegment(segment: string): string {
  return encodeURIComponent(segment).replace(/[!'()*]/g, (ch) =>
    `%${ch.charCodeAt(0).toString(16).toUpperCase()}`,
  )
}

function canonicalPath(objectKey: string): string {
  return objectKey
    .split('/')
    .map((segment) => uriEncodeSegment(segment))
    .join('/')
}

export function r2PresignConfig(
  env: DeliveryEnv,
): { endpoint: string; accessKeyId: string; secretAccessKey: string; region: string } | null {
  if (!env.R2_ENDPOINT || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) return null
  return {
    endpoint: env.R2_ENDPOINT.replace(/\/$/, ''),
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    region: env.R2_REGION ?? 'auto',
  }
}

export async function createR2PresignedUrl(
  env: DeliveryEnv,
  objectKey: string,
  expiresSeconds: number,
): Promise<string | null> {
  const config = r2PresignConfig(env)
  if (!config) return null

  const host = new URL(config.endpoint).host
  const now = new Date()
  const amzDate = now
    .toISOString()
    .replace(/[:-]/g, '')
    .replace(/\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)
  const scope = `${dateStamp}/${config.region}/s3/aws4_request`

  const query: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${config.accessKeyId}/${scope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(Math.trunc(expiresSeconds)),
    'X-Amz-SignedHeaders': 'host',
  }

  const signedKeys = Object.keys(query).sort()
  const canonicalQueryString = signedKeys
    .map((key) => `${uriEncodeSegment(key)}=${uriEncodeSegment(query[key] ?? '')}`)
    .join('&')

  const canonicalRequest = [
    'GET',
    `/${canonicalPath(objectKey)}`,
    canonicalQueryString,
    `host:${host}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n')

  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${await sha256Hex(canonicalRequest)}`

  const kDate = await hmacSha256(`AWS4${config.secretAccessKey}`, dateStamp)
  const kRegion = await hmacSha256(kDate, config.region)
  const kService = await hmacSha256(kRegion, 's3')
  const kSigning = await hmacSha256(kService, 'aws4_request')
  const signature = await hmacSha256(kSigning, stringToSign)

  return `${config.endpoint}/${canonicalPath(objectKey)}?${canonicalQueryString}&X-Amz-Signature=${signature}`
}

export function contentDispositionHeader(filename: string): string {
  const safe = sanitizeFileName(filename)
  const ascii = safe.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe)}`
}