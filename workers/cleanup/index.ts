export type Env = {
  CLEANUP_ENDPOINT: string
  CLEANUP_SECRET: string
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runCleanup(env))
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'POST') {
      const result = await runCleanup(env)
      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      })
    }
    return new Response('ok', { status: 200 })
  },
}

async function runCleanup(env: Env): Promise<{ ok: boolean; error?: string; result?: unknown }> {
  const endpoint = env.CLEANUP_ENDPOINT
  const secret = env.CLEANUP_SECRET
  if (!endpoint || !secret) {
    return { ok: false, error: 'CLEANUP_ENDPOINT and CLEANUP_SECRET must be configured on the worker' }
  }
  const headers: Record<string, string> = {
    'x-cleanup-secret': secret,
    'x-cleanup-since': String(Date.now()),
  }
  try {
    const response = await fetch(endpoint, { method: 'POST', headers })
    const body = (await response.json()) as { ok?: boolean; result?: unknown; error?: string }
    return { ok: response.ok && body.ok !== false, result: body.result, error: body.error }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: message }
  }
}