import type { R2Bucket } from '@cloudflare/workers-types'
import { contentDispositionHeader } from '../_lib/r2'

type R2Range = { offset: number; length: number }

// Serve an R2 object with HTTP Range support (needed so <video> can seek the
// preview). All callers must have already passed the private-token gate.
export async function streamObject(
  bucket: R2Bucket,
  key: string,
  request: Request,
  contentType: string,
  attachment?: { filename: string },
): Promise<Response | null> {
  const head = await bucket.head(key)
  if (!head) return null
  const size = head.size

  let status = 200
  let standardRange: R2Range | undefined
  let contentRange: string | undefined

  const rangeHeader = request.headers.get('Range')
  const startRaw = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader ?? '')?.[1]
  const endRaw = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader ?? '')?.[2]
  if (startRaw !== undefined) {
    const start = Math.min(Number(startRaw), size - 1)
    const end = endRaw !== undefined ? Math.min(Number(endRaw), size - 1) : size - 1
    if (end >= start) {
      status = 206
      contentRange = `bytes ${start}-${end}/${size}`
      standardRange = { offset: start, length: end - start + 1 }
    }
  }

  const object = standardRange
    ? await bucket.get(key, { range: standardRange })
    : await bucket.get(key)
  if (!object) return null

  const headers = new Headers()
  headers.set('Content-Type', object.httpMetadata?.contentType ?? contentType)
  headers.set('Accept-Ranges', 'bytes')
  headers.set('Content-Length', String(object.size))
  headers.set('Cache-Control', 'private, no-store')
  if (contentRange) headers.set('Content-Range', contentRange)
  if (attachment) headers.set('Content-Disposition', contentDispositionHeader(attachment.filename))
  return new Response(object.body, { status, headers })
}

export function noStoreResponse(status: number, message = 'Not found'): Response {
  return new Response(message, {
    status,
    headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' },
  })
}