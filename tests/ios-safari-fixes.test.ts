// Regression tests for the iOS Safari rendering / scrolling fixes.
//
// Two proven root causes are locked down here:
//
// 1. Stale asset caching. styles.css / script.js are served with
//    `Cache-Control: immutable, max-age=31536000`, so iOS Safari keeps a
//    cached copy for a year. If the file content changes but the `?v=` query
//    does not, the device keeps the OLD CSS/JS (the "broken on phone, fine on
//    desktop" symptom). build.mjs must stamp a content hash onto every HTML
//    file so the URL changes whenever the file changes.
//
// 2. iOS viewport scroll model. `html { overflow-x: hidden }` makes `html`
//    the scroll container and stops `body`'s overflow from propagating to the
//    viewport, which with a flex `body` broke "scroll to the bottom". The CSS
//    must NOT set a non-visible overflow on `html`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')

const stylesCss = fs.readFileSync(path.join(root, 'styles.css'), 'utf-8')
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf-8')

// ---------------------------------------------------------------------------
// 1. Cache-busting
// ---------------------------------------------------------------------------

function inlineScriptsExtractedFromHtml(html) {
  return {
    styles: [...html.matchAll(/styles\.css\?v=([^"'&\s]*)/g)].map((m) => m[1]),
    script: [...html.matchAll(/script\.js\?v=([^"'&\s]*)/g)].map((m) => m[1]),
  }
}

function hashContent(file) {
  const data = fs.readFileSync(path.join(root, file))
  let h = 0x811c9dc5
  for (let i = 0; i < data.length; i++) {
    h ^= data[i]
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16)
}

test('index.html references a content-hashed styles.css (not a frozen version)', () => {
  const { styles } = inlineScriptsExtractedFromHtml(indexHtml)
  assert.ok(styles.length > 0, 'styles.css must be referenced with a ?v= query')
  const expected = hashContent('styles.css')
  for (const v of styles) {
    assert.equal(v, expected, `styles.css?v=${v} must equal the content hash ${expected}`)
  }
})

test('index.html references a content-hashed script.js (not a frozen version)', () => {
  const { script } = inlineScriptsExtractedFromHtml(indexHtml)
  assert.ok(script.length > 0, 'script.js must be referenced with a ?v= query')
  const expected = hashContent('script.js')
  for (const v of script) {
    assert.equal(v, expected, `script.js?v=${v} must equal the content hash ${expected}`)
  }
})

test('the old frozen version strings are gone from every page', () => {
  const routes = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((name) => !/^\./.test(name))
    .filter((name) => !['node_modules', 'functions', 'tests', 'assets', 'data', 'scripts', 'supabase', 'workers'].includes(name))
    .filter((name) => fs.existsSync(path.join(root, name, 'index.html')))

  const files = ['index.html', ...routes.map((r) => `${r}/index.html`)]
  for (const file of files) {
    const html = fs.readFileSync(path.join(root, file), 'utf-8')
    assert.ok(!html.includes('styles.css?v=3.0.4'), `${file} still uses the stale styles.css?v=3.0.4`)
    assert.ok(!html.includes('script.js?v=e82af2ed'), `${file} still uses the stale script.js?v=e82af2ed`)
  }
})

test('build.mjs derives asset versions from file content', () => {
  const buildSrc = fs.readFileSync(path.join(root, 'build.mjs'), 'utf-8')
  assert.match(buildSrc, /contentHash/, 'build.mjs must hash asset content')
  assert.match(buildSrc, /applyAssetVersions/, 'build.mjs must rewrite ?v= queries')
})

// ---------------------------------------------------------------------------
// 2. iOS scroll model
// ---------------------------------------------------------------------------

test('html does not set a non-visible overflow (iOS viewport propagation)', () => {
  // Extract the `html { ... }` rule block.
  const htmlRule = stylesCss.match(/(^|\n)html\s*\{([\s\S]*?)\}/)
  assert.ok(htmlRule, 'an `html {}` rule must exist')
  const block = htmlRule[2]
  // Strip comments so explanatory prose about the old value is ignored.
  const decls = block.replace(/\/\*[\s\S]*?\*\//g, '')
  assert.ok(
    !/overflow(-[xy])?\s*:\s*(hidden|clip|auto|scroll)/.test(decls),
    'html must not set a non-visible overflow (breaks iOS viewport scroll propagation)',
  )
})

test('body clips horizontally without becoming a vertical scroll container', () => {
  const bodyRule = stylesCss.match(/(^|\n)body\s*\{([\s\S]*?)\}/)
  assert.ok(bodyRule, 'a `body {}` rule must exist')
  const decls = bodyRule[2].replace(/\/\*[\s\S]*?\*\//g, '')
  assert.match(decls, /overflow-x\s*:\s*clip/, 'body should clip horizontal overflow with `clip`')
  assert.ok(
    !/overflow-y\s*:\s*auto/.test(decls),
    'body must not set overflow-y:auto (re-introduces a nested scroll container)',
  )
})

// ---------------------------------------------------------------------------
// 3. Reveal safety net (content can never stay invisible)
// ---------------------------------------------------------------------------

test('script.js keeps a reveal safety net that activates hidden reveal elements', () => {
  const script = fs.readFileSync(path.join(root, 'script.js'), 'utf-8')
  assert.match(script, /revealFallback/, 'a reveal fallback must exist')
  assert.match(
    script,
    /reveal-fade:not\(\.active\)|reveal-scale:not\(\.active\)/,
    'the fallback must target still-hidden reveal elements',
  )
})

test('the scroll-reveal observer uses threshold 0 (tall elements can intersect)', () => {
  const script = fs.readFileSync(path.join(root, 'script.js'), 'utf-8')
  const opts = script.match(/const observerOptions\s*=\s*\{([\s\S]*?)\}/)
  assert.ok(opts, 'observerOptions must exist')
  assert.match(opts[1], /threshold\s*:\s*0\b/, 'observer threshold must be 0')
})

// Dynamically rendered grids (homepage previews, category pages, models,
// media-buyer, voiceover) are created AFTER initial load, often below the fold
// and frequently after the 1200ms global revealFallback has already run. The
// IntersectionObserver only fires for them once scrolled into view, so on slow
// connections every freshly created card sat at opacity:0 — the portfolio
// looked empty on mobile while the header still showed. Every dynamic render
// path must therefore actively reveal its own cards.

test('forceActivateRevealCards schedules a safety sweep for below-fold cards', () => {
  const script = fs.readFileSync(path.join(root, 'script.js'), 'utf-8')
  const fn = script.match(/function forceActivateRevealCards\(grid\)\s*\{[\s\S]*?\n\}/)
  assert.ok(fn, 'forceActivateRevealCards must exist')
  assert.match(fn[0], /setTimeout/, 'forceActivateRevealCards must schedule a delayed sweep')
  assert.match(
    fn[0],
    /reveal-scale:not\(\.active\)/,
    'the sweep must activate still-hidden reveal cards',
  )
})

test('renderVideoCards reveals freshly created cards on re-render', () => {
  const script = fs.readFileSync(path.join(root, 'script.js'), 'utf-8')
  const fn = script.match(/function renderVideoCards\([\s\S]*?\n\}/)
  assert.ok(fn, 'renderVideoCards must exist')
  assert.match(
    fn[0],
    /classList\.add\('active'\)/,
    'renderVideoCards must mark re-rendered cards active so they are not left invisible',
  )
})

test('all dynamic grid loaders activate their reveal cards after rendering', () => {
  const script = fs.readFileSync(path.join(root, 'script.js'), 'utf-8')
  for (const loader of ['loadModels', 'loadMediaBuyer']) {
    const fn = script.match(new RegExp(`async function ${loader}\\(\\)\\s*\\{[\\s\\S]*?\\n\\}`))
    assert.ok(fn, `${loader} must exist`)
    assert.match(
      fn[0],
      /forceActivateRevealCards/,
      `${loader} must call forceActivateRevealCards so its images are visible`,
    )
  }
})

// ---------------------------------------------------------------------------
// 4. Scroll lock can never stick across page changes
// ---------------------------------------------------------------------------

test('showPage defensively releases any stuck scroll lock', () => {
  const script = fs.readFileSync(path.join(root, 'script.js'), 'utf-8')
  const showPage = script.match(/function showPage\([\s\S]*?\n\}/)
  assert.ok(showPage, 'showPage must exist')
  assert.match(showPage[0], /classList\.remove\('modal-open'\)/, 'showPage must clear modal-open')
  assert.match(showPage[0], /style\.touchAction/, 'showPage must clear stuck touch-action')
})
