// Regression tests for the inline browser-compatibility gate in index.html.
//
// The gate is ES5 inline script that decides whether a visitor's browser can
// run the modern bundle. It must:
//   - accept every modern browser (Chrome, Edge, Brave, Firefox, Safari), and
//   - reject genuinely unsupported browsers, and
//   - NEVER use eval()/new Function(), because the site's CSP omits
//     'unsafe-eval' — doing so previously reported a CSP EvalError as an
//     "outdated browser" on fully modern browsers (the reported bug).
//
// These tests execute the REAL shipped gate extracted from index.html, not a
// copy, so the artifact can't drift from what is tested.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf-8')

// Extract the first inline <script> that contains the compatibility gate.
function extractGateSource(html) {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1])
  const gate = scripts.find((s) => s.includes('pp-unsupported-browser'))
  assert.ok(gate, 'compatibility gate script must exist in index.html')
  return gate
}

const GATE_SOURCE = extractGateSource(indexHtml)

// Minimal DOM mock. `appendChild` records appended nodes; warnings are detected
// via a getElementById that only finds an existing warning node.
function makeDom({ bodyReady }) {
  const appended = []
  let htmlClass = ''
  const listeners = {}
  const doc = {
    body: bodyReady
      ? { appendChild: (n) => appended.push(n) }
      : null,
    documentElement: {
      get className() { return htmlClass },
      set className(v) { htmlClass = v },
    },
    getElementById: () => null,
    createElement: () => ({
      id: '',
      setAttribute() {},
      innerHTML: '',
    }),
    addEventListener: (ev, cb) => { listeners[ev] = cb },
  }
  return { doc, appended, listeners, getHtmlClass: () => htmlClass }
}

// Build a sandbox that mirrors a browser global scope.
// `caps` selects which capabilities exist; `evalBlocked` simulates the site CSP.
function runGate({ caps, bodyReady = true, evalBlocked = false, extraDom } = {}) {
  const dom = extraDom || makeDom({ bodyReady })

  const realFunction = Function
  let sandboxFunction = realFunction
  let sandboxEval = eval
  if (evalBlocked) {
    const block = () => { const e = new Error('CSP'); e.name = 'EvalError'; throw e }
    sandboxFunction = block
    sandboxEval = block
  }

  const sandbox = {
    window: {},
    document: dom.doc,
    console,
    Object,
    Array,
    String,
    Function: sandboxFunction,
    eval: sandboxEval,
    // Capability surface, toggled per scenario.
    Promise: caps.Promise ? Promise : undefined,
    fetch: caps.fetch ? function fetch() {} : undefined,
    IntersectionObserver: caps.IntersectionObserver ? function IntersectionObserver() {} : undefined,
    requestAnimationFrame: caps.requestAnimationFrame ? function () {} : undefined,
    HTMLScriptElement: { prototype: {} },
    CSS: caps.CSS
      ? {
          supports: (prop, value) => {
            if (evalBlocked) { /* pure function, no eval needed */ }
            if (prop === '--a') return caps.cssCustomProps !== false
            if (prop === 'selector(:is(a))') return caps.cssIs !== false
            return false
          },
        }
      : undefined,
  }
  // customElements lives on window in browsers; some engines expose it globally.
  if (caps.customElements) sandbox.window.customElements = {}
  // CSS is exposed as a global in browsers, i.e. identical to window.CSS.
  sandbox.window.CSS = sandbox.CSS
  // noModule is a property on HTMLScriptElement.prototype.
  if (caps.noModule) {
    Object.defineProperty(sandbox.HTMLScriptElement.prototype, 'noModule', { value: true })
  }

  vm.createContext(sandbox)
  vm.runInContext(GATE_SOURCE, sandbox, { timeout: 2000 })
  return dom
}

const MODERN = {
  Promise: true,
  fetch: true,
  IntersectionObserver: true,
  requestAnimationFrame: true,
  customElements: true,
  noModule: true,
  CSS: true,
  cssCustomProps: true,
  cssIs: true,
}

// ---------------------------------------------------------------------------
// The reported regression: modern browser under the real CSP must be accepted.
// ---------------------------------------------------------------------------

test('modern Chromium/Brave environment is accepted under a no-unsafe-eval CSP', () => {
  // evalBlocked = true reproduces the site's actual CSP (no 'unsafe-eval').
  const dom = runGate({ caps: MODERN, bodyReady: true, evalBlocked: true })
  assert.equal(dom.appended.length, 0, 'no warning must be shown to a modern browser')
  assert.equal(dom.getHtmlClass(), '', 'unsupported class must not be set')
})

test('modern environment is accepted without a CSP (file:// / no CSP)', () => {
  const dom = runGate({ caps: MODERN, bodyReady: true, evalBlocked: false })
  assert.equal(dom.appended.length, 0)
  assert.equal(dom.getHtmlClass(), '')
})

test('gate never calls eval() or new Function() (would throw under CSP)', () => {
  // Strip comments so the check inspects code only, not explanatory prose.
  const code = GATE_SOURCE
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
  assert.ok(!/\beval\s*\(/.test(code), 'gate must not call eval()')
  assert.ok(!/new\s+Function\s*\(/.test(code), 'gate must not call new Function()')
})

// ---------------------------------------------------------------------------
// Genuinely unsupported browsers must be rejected.
// ---------------------------------------------------------------------------

test('a browser without Promise is rejected and warned', () => {
  const dom = runGate({ caps: { ...MODERN, Promise: false } })
  assert.equal(dom.appended.length, 1, 'warning must be appended')
  assert.match(dom.getHtmlClass(), /pp-unsupported-browser/)
})

test('a browser without IntersectionObserver is rejected', () => {
  const dom = runGate({ caps: { ...MODERN, IntersectionObserver: false } })
  assert.equal(dom.appended.length, 1)
})

test('a browser without fetch is rejected', () => {
  const dom = runGate({ caps: { ...MODERN, fetch: false } })
  assert.equal(dom.appended.length, 1)
})

test('a browser without Web Components is rejected', () => {
  const dom = runGate({ caps: { ...MODERN, customElements: false } })
  assert.equal(dom.appended.length, 1)
})

test('a browser without ES-module support is rejected', () => {
  const dom = runGate({ caps: { ...MODERN, noModule: false } })
  assert.equal(dom.appended.length, 1)
})

test('a browser without CSS custom properties is rejected', () => {
  const dom = runGate({ caps: { ...MODERN, cssCustomProps: false } })
  assert.equal(dom.appended.length, 1)
})

test('a browser without CSS.supports is rejected', () => {
  const dom = runGate({ caps: { ...MODERN, CSS: false } })
  assert.equal(dom.appended.length, 1)
})

// ---------------------------------------------------------------------------
// DOM-readiness handling.
// ---------------------------------------------------------------------------

test('warning is deferred until DOMContentLoaded when body is not ready', () => {
  const dom = runGate({ caps: { ...MODERN, fetch: false }, bodyReady: false })
  assert.equal(dom.appended.length, 0, 'must not append before body exists')
  assert.equal(typeof dom.listeners['DOMContentLoaded'], 'function', 'must register a deferral listener')
  // Simulate the DOM becoming ready, then fire the listener.
  dom.doc.body = { appendChild: (n) => dom.appended.push(n) }
  dom.listeners['DOMContentLoaded']()
  assert.equal(dom.appended.length, 1, 'warning shown once DOM is ready')
})

test('the shipped gate is embedded in every prerendered route', () => {
  const root = path.join(__dirname, '..')
  const routes = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((name) => !/^\./.test(name))
    .filter((name) => !['node_modules', 'functions', 'tests', 'assets', 'data', 'scripts', 'supabase', 'workers'].includes(name))
    .filter((name) => fs.existsSync(path.join(root, name, 'index.html')))

  assert.ok(routes.length > 0, 'expected at least one prerendered route')
  for (const route of routes) {
    const html = fs.readFileSync(path.join(root, route, 'index.html'), 'utf-8')
    assert.match(html, /pp-unsupported-browser/, `${route}/index.html should include the gate`)
    const code = html
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '')
    assert.ok(!/new\s+Function\s*\(/.test(code), `${route}/index.html gate must not use new Function()`)
  }
})
