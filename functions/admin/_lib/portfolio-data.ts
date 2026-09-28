import { httpUrls, readStaticAsset, readStaticJson, type StaticContext } from './static-data'

//============================================================================
// Phase 4D — read-only Portfolio overview.
// The public portfolio is a set of static /data/*.txt catalogues of Bamboo
// Cloud embed URLs declared in /data/config.json. Nothing here writes or
// migrates that content; it only reads it for the admin browser.
//============================================================================

export type PortfolioCategory = {
  key: string
  label: string
  title: string
  subtitle: string
  description: string
  route: string
  txtFile: string
  videos: string[]
}

type CategoryConfig = {
  label?: string
  title?: string
  subtitle?: string
  description?: string
  txtFile?: string
}

// The public route for a category does not always match its config key
// (config uses the historical slug "shoting"; the page is /shooting).
const ROUTE_BY_KEY: Record<string, string> = {
  shoting: 'shooting',
}

function routeFor(key: string): string {
  return ROUTE_BY_KEY[key] ?? key
}

export async function loadPortfolioOverview(
  context: StaticContext,
): Promise<PortfolioCategory[]> {
  const parsed = await readStaticJson<{ categories?: Record<string, CategoryConfig> }>(
    context,
    '/data/config.json',
  )
  const categories = parsed?.categories
  if (!categories) return []

  const result: PortfolioCategory[] = []
  for (const [key, category] of Object.entries(categories)) {
    const txtFile = category.txtFile ?? ''
    if (!txtFile) continue // non-video pages (models, media-buyer, voice-over)
    const text = await readStaticAsset(context, `/data/${txtFile}`)
    result.push({
      key,
      label: category.label ?? key,
      title: category.title ?? category.label ?? key,
      subtitle: category.subtitle ?? '',
      description: category.description ?? '',
      route: routeFor(key),
      txtFile,
      videos: text ? httpUrls(text) : [],
    })
  }
  return result
}
