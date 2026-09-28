import type { AppUserRow } from './types'

export const PROFILE_AVATAR_MAX_BYTES = 5 * 1024 * 1024 // 5 MB
export const PROFILE_NAME_MAX_CHARS = 80

export type ProfileImageType = 'jpeg' | 'png' | 'webp'

// Server-side image sniffing (never trusts the browser MIME alone).
export function detectImageType(bytes: Uint8Array): ProfileImageType | null {
  const hasPrefix = (start: number, seq: number[]): boolean =>
    start + seq.length <= bytes.length && seq.every((byte, i) => bytes[start + i] === byte)
  if (hasPrefix(0, [0xff, 0xd8, 0xff])) return 'jpeg'
  if (hasPrefix(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png'
  if (
    bytes.length >= 12 &&
    hasPrefix(0, [0x52, 0x49, 0x46, 0x46]) &&
    hasPrefix(8, [0x57, 0x45, 0x42, 0x50])
  ) {
    return 'webp'
  }
  return null
}

export function imageExtension(type: ProfileImageType): string {
  return type === 'jpeg' ? 'jpg' : type
}

export function imageMime(type: ProfileImageType): string {
  return type === 'jpeg' ? 'image/jpeg' : `image/${type}`
}

// Private R2 object key. Only ever served through the authenticated
// /admin/avatar route — the bucket stays non-public.
export function avatarObjectKey(userId: string, type: ProfileImageType): string {
  return `avatars/${userId}/profile.${imageExtension(type)}`
}

export function normalizeProfileName(input: string): string | null {
  const name = input.trim().replace(/\s+/g, ' ')
  if (name.length === 0 || name.length > PROFILE_NAME_MAX_CHARS) return null
  if (/[<>&"']/.test(name)) return null
  return name
}

// The configured display name is the primary identity in the admin UI.
// Without one we fall back to a neutral Arabic label — never the email.
export function profileDisplayName(user: Pick<AppUserRow, 'full_name'>): string {
  const name = user.full_name?.trim()
  return name && name.length > 0 ? name : 'المستخدم'
}

// Initials avatar source must come from the display name, never the email.
export function profileInitials(user: Pick<AppUserRow, 'full_name'>): string {
  const words = profileDisplayName(user)
    .split(/\s+/)
    .filter((w) => w.length > 0)
  if (words.length === 0) return 'م'
  const first = words[0]?.slice(0, 1) ?? ''
  const last = words.length > 1 ? (words[words.length - 1]?.slice(0, 1) ?? '') : ''
  return (first + last).toLocaleUpperCase('ar')
}