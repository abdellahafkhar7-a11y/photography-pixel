import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  applySecurityHeaders,
  CLIENT_PAGE_CSP,
  SECURITY_HEADERS,
} from '../functions/_lib/security-headers.ts'

function html(body = '<!doctype html><title>x</title>', status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

test('baseline security headers are added to an HTML response', () => {
  const out = applySecurityHeaders(html())
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    assert.equal(out.headers.get(name), value, `${name} should be set`)
  }
  assert.equal(out.headers.get('Content-Type'), 'text/html; charset=utf-8')
})

test('existing route headers are never overwritten', () => {
  const original = new Response('<x>', {
    status: 200,
    headers: {
      'Content-Type': 'text/html',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex',
    },
  })
  const out = applySecurityHeaders(original)
  assert.equal(out.headers.get('Cache-Control'), 'private, no-store')
  assert.equal(out.headers.get('X-Content-Type-Options'), 'nosniff')
  assert.equal(out.headers.get('X-Robots-Tag'), 'noindex')
  assert.equal(out.headers.get('Content-Type'), 'text/html')
})

test('the CSP is only attached to HTML documents', () => {
  const page = applySecurityHeaders(html(), { csp: CLIENT_PAGE_CSP })
  assert.equal(page.headers.get('Content-Security-Policy'), CLIENT_PAGE_CSP)

  const media = applySecurityHeaders(
    new Response('nope', { status: 404, headers: { 'Content-Type': 'text/plain;charset=UTF-8' } }),
    { csp: CLIENT_PAGE_CSP },
  )
  assert.equal(media.headers.get('Content-Security-Policy'), null)
  // baseline headers still apply to non-HTML responses
  assert.equal(media.headers.get('X-Content-Type-Options'), 'nosniff')
})

test('an existing Content-Security-Policy is preserved', () => {
  const withCsp = new Response('x', {
    headers: { 'Content-Type': 'text/html', 'Content-Security-Policy': "default-src 'none'" },
  })
  const out = applySecurityHeaders(withCsp, { csp: CLIENT_PAGE_CSP })
  assert.equal(out.headers.get('Content-Security-Policy'), "default-src 'none'")
})

test('status, statusText, Location and Set-Cookie survive', () => {
  const redirect = new Response(null, {
    status: 303,
    headers: { Location: '/admin', 'Set-Cookie': 'sb=abc; Path=/; HttpOnly' },
  })
  const out = applySecurityHeaders(redirect)
  assert.equal(out.status, 303)
  assert.equal(out.headers.get('Location'), '/admin')
  assert.equal(out.headers.get('Set-Cookie'), 'sb=abc; Path=/; HttpOnly')
  assert.equal(out.headers.get('X-Frame-Options'), 'DENY')
})
