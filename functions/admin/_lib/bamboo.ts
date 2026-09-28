//============================================================================
// Bamboo Cloud helpers (Phase 4I).
// The public portfolio embeds Bamboo Cloud player URLs; every entry carries a
// stable `id` (a Kaltura entry id). Bamboo's public Thumbnail service can
// derive a real poster frame from that entry id — used only as the admin
// portfolio's poster source (never fabricated). No video is downloaded or
// rehosted; the source of both poster and playback stays Bamboo Cloud.
//============================================================================

export const PORTFOLIO_THUMB_W = 640
export const PORTFOLIO_THUMB_H = 360

export function embedIdOf(embedUrl: string): string {
  const match = /[?&]id=([0-9A-Za-z_\-]+)/.exec(embedUrl)
  return match?.[1] ?? ''
}

export function thumbUrlFor(embedUrl: string, width = PORTFOLIO_THUMB_W, height = PORTFOLIO_THUMB_H): string {
  const entryId = embedIdOf(embedUrl)
  if (!entryId) return ''
  return `https://cdn.bamboo-cloud.com/p/1/thumbnail/entry_id/${encodeURIComponent(entryId)}/width/${width}/height/${height}`
}