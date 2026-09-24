import type { PagesFunction } from '@cloudflare/workers-types'
import { applyCookies } from './_lib/cookies'
import type { Env } from './_lib/env'
import { createServerClients } from './_lib/supabase'

export const onRequest: PagesFunction<Env, never, Record<string, unknown>> = async (
  context,
) => {
  const clients = createServerClients(context.request, context.env)
  if (clients) {
    context.data.supabase = clients.supabase
    context.data.service = clients.service
    context.data.bag = clients.bag
  }
  const response = await context.next()
  if (clients) return applyCookies(response, clients.bag)
  return response
}