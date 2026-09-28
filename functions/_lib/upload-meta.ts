// Shared file-metadata validation for the per-delivery upload route and the
// standalone "رفع فيديو جديد" wizard. Both implement the same client upload
// protocol (init/part/complete/abort/stream) so the acceptance rules must
// match exactly.

const VIDEO_EXT: Record<string, string> = {
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  m4v: 'video/x-m4v',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  mpeg: 'video/mpeg',
  mpg: 'video/mpeg',
}

export function extOf(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot === -1 ? '' : filename.slice(dot + 1).toLowerCase()
}

// The client never declares a real MIME type for some containers, so a claimed
// value that is NOT video/... and NOT image/... falls back to the extension
// table. Returns null when the file is clearly not a supported video.
export function detectMime(claimed: string, filename: string): string | null {
  const fromType = (claimed ?? '').toLowerCase()
  if (fromType.startsWith('video/') || fromType.startsWith('image/')) return fromType
  const ext = extOf(filename)
  return VIDEO_EXT[ext] ?? null
}

// Object keys are sanitized (ASCII-only) by r2.ts, but the human-facing
// original_filename preserves the user's real name (path- and control-safe).
export function displayName(name: string): string {
  const base = (name ?? 'original.mp4').split(/[\\/]/).pop() ?? 'original.mp4'
  const cleaned = base.replace(/[\0-\x1f\x7f]/g, '').trim()
  return cleaned || 'original.mp4'
}

export function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}