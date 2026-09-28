import { httpUrls, readStaticAsset, readStaticJson, type StaticContext } from './static-data'

//============================================================================
// Phase 4E — read-only loaders for the content modules.
// Every record comes from the site's existing /data files. Nothing is
// invented and nothing is written; missing/malformed data yields [].
//============================================================================

export type ModelRecord = {
  name: string
  photo: string
  age: string
  height: string
  city: string
  category: string
  experience: string
  available: boolean
  description: string
}

export type MediaBuyerRecord = {
  screenshot: string
  campaign: string
  platform: string
  objective: string
  messages: string
  result: string
  description: string
}

export type VoiceOverRecord = {
  id: string
  title: string
  category: string
  description: string
  cover: string
  audio: string
  duration: string
  language: string
  client: string
  date: string
  featured: boolean
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

export async function loadModels(context: StaticContext): Promise<ModelRecord[]> {
  return asArray<ModelRecord>(await readStaticJson<unknown>(context, '/data/models.json'))
}

export async function loadMediaBuyer(context: StaticContext): Promise<MediaBuyerRecord[]> {
  return asArray<MediaBuyerRecord>(
    await readStaticJson<unknown>(context, '/data/media-buyer.json'),
  )
}

export async function loadVoiceOver(context: StaticContext): Promise<VoiceOverRecord[]> {
  return asArray<VoiceOverRecord>(
    await readStaticJson<unknown>(context, '/data/voiceover.json'),
  )
}

export async function loadUgc(context: StaticContext): Promise<string[]> {
  const text = await readStaticAsset(context, '/data/ugc.txt')
  return text ? httpUrls(text) : []
}
