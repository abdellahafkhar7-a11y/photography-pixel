import type { R2Bucket } from '@cloudflare/workers-types'

// Conservative content-based validation for uploaded video files. Extensions and
// client-declared MIME types are untrusted; this layer reads only the first few
// bytes of the stored object and compares the real container signature with the
// detected type. It is deliberately narrow: a format is only *rejected* when its
// signature is reliable, and formats with ambiguous headers are accepted on
// their declared type rather than risk rejecting legitimate files.
//
// Reliable signatures (enforced):
//   - mp4 / m4v / mov : ISO-BMFF / QuickTime box. 'ftyp', or a legacy top-level
//                       atom at offset 4 ('moov' / 'mdat' / 'wide' / 'free' /
//                       'skip' / 'pnot' / 'junk' / 'cmov'). The atom must also
//                       carry a well-formed box size, so arbitrary bytes cannot
//                       match by accident.
//   - webm / mkv      : EBML magic 1A 45 DF A3.
//   - avi             : RIFF....'AVI '/'AVIX'.
// NOT reliably identifiable by a simple signature (accepted on declared type):
//   - mpeg / mpg      : MPEG program streams may start with several different
//                       pack/sequence/GOP start codes, so no single rule is safe.
// 'uuid' is NOT accepted as a MOV/MP4 signature: it is a generic extension box
// that can wrap ANY payload, so it says nothing about the file being video.

export type VideoSignature = 'mp4' | 'webm' | 'avi' | 'mpeg' | 'unknown'

export type SignatureCheck = { ok: true } | { ok: false; reason: 'mismatch' | 'malformed' }

export const SIGNATURE_HEAD_BYTES = 64

// Top-level QuickTime / ISO-BMFF boxing atoms that legitimately appear as the
// FIRST atom of a valid .mov / .mp4 / .m4v file. All are media-container boxes.
// 'uuid' is deliberately absent (see the header comment).
const QUICKTIME_TOP_LEVEL_ATOMS: ReadonlySet<string> = new Set([
  'ftyp',
  'moov',
  'mdat',
  'wide',
  'free',
  'skip',
  'pnot',
  'junk',
  'cmov',
])

// A real box starts with a 32-bit big-endian size. Size 1 means the real size is
// carried by the following 64-bit field; every other size is at least the
// 8-byte box header. This stops junk that merely contains a known atom name.
function isPlausibleBoxSize(head: Uint8Array): boolean {
  const size =
    (head[0] ?? 0) * 0x1000000 + (head[1] ?? 0) * 0x10000 + (head[2] ?? 0) * 0x100 + (head[3] ?? 0)
  return size === 1 || size >= 8
}

function asciiAt(head: Uint8Array, offset: number, length: number): string {
  let out = ''
  for (let i = 0; i < length; i += 1) {
    const byte = head[offset + i]
    if (byte === undefined) return out
    out += String.fromCharCode(byte)
  }
  return out
}

export function sniffVideoSignature(head: Uint8Array): VideoSignature {
  if (head.length >= 12 && asciiAt(head, 0, 4) === 'RIFF') {
    const form = asciiAt(head, 8, 4)
    if (form === 'AVI ' || form === 'AVIX') return 'avi'
  }
  if (head.length >= 4 && head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) {
    return 'webm'
  }
  if (head.length >= 8) {
    const atom = asciiAt(head, 4, 4)
    if (QUICKTIME_TOP_LEVEL_ATOMS.has(atom) && isPlausibleBoxSize(head)) {
      return 'mp4'
    }
  }
  if (head.length >= 4 && head[0] === 0x00 && head[1] === 0x00 && head[2] === 0x01) {
    const code = head[3]
    if (code === 0xba || code === 0xb3 || code === 0xb8) return 'mpeg'
  }
  return 'unknown'
}

function expectedSignatureGroup(mime: string): VideoSignature {
  switch (mime) {
    case 'video/mp4':
    case 'video/x-m4v':
    case 'video/quicktime':
      return 'mp4'
    case 'video/webm':
    case 'video/x-matroska':
      return 'webm'
    case 'video/x-msvideo':
      return 'avi'
    case 'video/mpeg':
      return 'mpeg'
    default:
      return 'unknown'
  }
}

// Signature groups too ambiguous to check safely — never rejected.
const LENIENT_GROUPS: ReadonlySet<VideoSignature> = new Set<VideoSignature>(['mpeg'])

export function verifyVideoSignature(mime: string, head: Uint8Array): SignatureCheck {
  const expected = expectedSignatureGroup(mime)
  // Unknown/lenient groups are not enforced (documented limitation).
  if (expected === 'unknown' || LENIENT_GROUPS.has(expected)) return { ok: true }
  const actual = sniffVideoSignature(head)
  if (actual === expected) return { ok: true }
  if (actual === 'unknown') return { ok: false, reason: 'malformed' }
  return { ok: false, reason: 'mismatch' }
}

// Read only the leading bytes of the stored object (never the whole file).
export async function readUploadHead(
  bucket: R2Bucket,
  key: string,
  length = SIGNATURE_HEAD_BYTES,
): Promise<Uint8Array | null> {
  const object = await bucket.get(key, { range: { offset: 0, length } })
  if (!object) return null
  const buffer = await object.arrayBuffer()
  return new Uint8Array(buffer)
}
