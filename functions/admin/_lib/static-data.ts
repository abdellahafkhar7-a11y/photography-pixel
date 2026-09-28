import type { PagesFunction } from '@cloudflare/workers-types'
import type { Env } from './env'

//============================================================================
// Shared read-only access to the site's static /data assets.
// Used by the read-only admin modules (portfolio, models, ugc, media-buyer,
// voice-over). Nothing here writes or migrates content.
//============================================================================

export type StaticContext = Parameters<
  PagesFunction<Env, never, Record<string, unknown>>
>[0]

type AssetsEnv = Env & {
  ASSETS?: {
    fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>
  }
}

export async function readStaticAsset(
  context: StaticContext,
  path: string,
): Promise<string | null> {
  try {
    const url = new URL(path, context.request.url)
    const assets = (context.env as AssetsEnv).ASSETS
    if (assets) {
      const res = await assets.fetch(url)
      if (res.ok) return await res.text()
    }
  } catch {
    // fall through to same-origin fetch
  }
  try {
    const res = await fetch(new URL(path, context.request.url))
    if (res.ok) return await res.text()
  } catch {
    // asset unavailable
  }
  return null
}

export async function readStaticJson<T>(
  context: StaticContext,
  path: string,
): Promise<T | null> {
  const text = await readStaticAsset(context, path)
  if (!text) return null
  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

export function httpUrls(text: string): string[] {
  const urls: string[] = []
  for (const line of text.split(/\r?\n/)) {
    const url = line.trim()
    if (/^https?:\/\//.test(url)) urls.push(url)
  }
  return urls
}
