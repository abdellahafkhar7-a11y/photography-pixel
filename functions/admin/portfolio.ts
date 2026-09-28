import type { PagesFunction } from '@cloudflare/workers-types'
import { html, requireSession } from './_lib/auth'
import type { Env } from './_lib/env'
import { renderPortfolio, type PortfolioViewOptions } from './_lib/views'
import { loadPortfolioOverview } from './_lib/portfolio-data'

type AdminFunction = PagesFunction<Env, never, Record<string, unknown>>

export const onRequestGet: AdminFunction = async (context) => {
  const appUser = await requireSession(context)
  if (appUser instanceof Response) return appUser
  const categories = await loadPortfolioOverview(context)
  const params = new URL(context.request.url).searchParams
  const options: PortfolioViewOptions = {
    q: params.get('q') ?? '',
    cat: params.get('cat') ?? '',
  }
  return html(renderPortfolio(appUser, categories, options))
}