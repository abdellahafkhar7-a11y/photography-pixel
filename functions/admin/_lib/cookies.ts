import type { CookieOptions } from '@supabase/ssr'

export type RequestCookie = { name: string; value: string }

export type CookieToSet = {
  name: string
  value: string
  options: CookieOptions
}

export function parseCookieHeader(value: string | null): RequestCookie[] {
  if (!value) return []
  const cookies: RequestCookie[] = []
  for (const part of value.split(';')) {
    const index = part.indexOf('=')
    if (index === -1) continue
    const name = part.slice(0, index).trim()
    const raw = part.slice(index + 1).trim()
    if (name) cookies.push({ name, value: raw })
  }
  return cookies
}

export class CookieBag {
  private readonly cookies: CookieToSet[] = []
  private readonly extraHeaders: Record<string, string> = {}

  add(name: string, value: string, options: CookieOptions): void {
    this.cookies.push({ name, value, options })
  }

  addAll = (cookiesToSet: CookieToSet[]): void => {
    for (const cookie of cookiesToSet) this.add(cookie.name, cookie.value, cookie.options)
  }

  mergeHeaders = (headers: Record<string, string>): void => {
    for (const [key, value] of Object.entries(headers)) {
      const existing = this.extraHeaders[key]
      this.extraHeaders[key] = existing ? `${existing}, ${value}` : value
    }
  }

  get entries(): readonly CookieToSet[] {
    return this.cookies
  }

  get headers(): Readonly<Record<string, string>> {
    return this.extraHeaders
  }
}

export function serializeSetCookie(cookie: CookieToSet): string {
  const { name, value, options } = cookie
  let out = `${name}=${value}`
  if (options.path) out += `; Path=${options.path}`
  if (options.domain) out += `; Domain=${options.domain}`
  if (typeof options.maxAge === 'number') out += `; Max-Age=${Math.trunc(options.maxAge)}`
  if (typeof options.expires !== 'undefined') {
    out += `; Expires=${options.expires instanceof Date ? options.expires.toUTCString() : String(options.expires)}`
  }
  if (options.httpOnly) out += '; HttpOnly'
  if (options.secure) out += '; Secure'
  if (options.sameSite) out += `; SameSite=${options.sameSite}`
  return out
}

export function applyCookies(response: Response, bag: CookieBag): Response {
  if (bag.entries.length === 0 && Object.keys(bag.headers).length === 0) return response
  const headers = new Headers(response.headers)
  for (const cookie of bag.entries) headers.append('Set-Cookie', serializeSetCookie(cookie))
  for (const [key, value] of Object.entries(bag.headers)) headers.set(key, value)
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}