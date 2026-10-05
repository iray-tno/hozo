import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createCompiler } from '@hozo/compiler'
import { lowerModule } from '@hozo/compiler/lower'
import { build, stop } from 'esbuild'
import { chromium } from 'playwright-core'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { comparePixels, verifyEffect } from './svg-filter-pixels.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const file = path.join(root, 'src/svg-filter-scene.tsx')
const source = readFileSync(file, 'utf8')
const require = createRequire(file)
const artifacts = path.join(root, 'artifacts/svg-filters')
mkdirSync(artifacts, { recursive: true })
// Keep failed runs as well as successes. A fresh directory means a startup
// failure cannot accidentally upload a previous run's passed=true evidence.
const output = mkdtempSync(path.join(artifacts, 'run-'))
const report = {
  passed: false,
  source: 'examples/showcase/src/svg-filter-scene.tsx',
  sourceSha256: createHash('sha256').update(source).digest('hex'),
  startedAt: new Date().toISOString(),
  scope: 'Chromium pixels: fallback vs compiled Web; no Native rendering claim',
  cases: [],
}
writeFileSync(path.join(output, 'evidence.json'), `${JSON.stringify(report, null, 2)}\n`)
const executablePath = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((candidate) => candidate && existsSync(candidate))
if (!executablePath) {
  if (process.env.CI) throw new Error('SVG filter pixel evidence requires Chrome in CI')
  console.log('[svg-filters] no browser found; set CHROME_PATH to run locally')
  process.exit(0)
}

async function load(code) {
  const result = await build({
    stdin: { contents: code, loader: 'tsx', resolveDir: path.dirname(file), sourcefile: file },
    bundle: true,
    packages: 'external',
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    write: false,
  })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(
    require,
    module,
    module.exports,
  )
  return module.exports
}
const lowered = lowerModule(source, file, file, createCompiler(), root)
assert.ok(lowered, 'the actual scene must be compiled, not silently compared to itself')
assert.match(lowered.code, /<svg\b/)
assert.doesNotMatch(lowered.code, /<Svg[.\s>]/)
writeFileSync(path.join(output, 'scene.compiled.tsx'), lowered.code)
const variants = { fallback: await load(source), compiled: await load(lowered.code) }
report.compiledSha256 = createHash('sha256').update(lowered.code).digest('hex')
let browser
try {
  browser = await chromium.launch({ executablePath, args: ['--no-sandbox', '--disable-gpu'] })
  report.browser = browser.version()
  const page = await browser.newPage({
    viewport: { width: 160, height: 160 },
    deviceScaleFactor: 1,
  })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  for (const kind of variants.fallback.SVG_FILTER_KINDS) {
    const images = {}
    for (const [name, variant] of Object.entries(variants)) {
      for (const enabled of [false, true]) {
        const markup = renderToStaticMarkup(
          createElement(variant.SvgFilterScene, { kind, enabled, idPrefix: 'pixels' }),
        )
        // Always the same origin, viewport and position; separate captures
        // prevent fallback definitions from satisfying a compiled url(#id).
        await page.setContent(
          `<!doctype html><style>body { margin:0; background:white }</style>${markup}`,
        )
        const svg = page.locator('svg')
        await svg.waitFor()
        const png = await svg.screenshot({
          path: path.join(output, `${kind}-${name}-${enabled ? 'on' : 'off'}.png`),
        })
        images[`${name}-${enabled}`] = await page.evaluate(async (base64) => {
          const image = new Image()
          image.src = `data:image/png;base64,${base64}`
          await image.decode()
          const canvas = document.createElement('canvas')
          canvas.width = image.width
          canvas.height = image.height
          const context = canvas.getContext('2d')
          context.drawImage(image, 0, 0)
          return {
            width: image.width,
            height: image.height,
            pixels: Array.from(context.getImageData(0, 0, image.width, image.height).data),
          }
        }, png.toString('base64'))
      }
    }
    const row = { kind, passed: false, parity: {}, effects: {} }
    report.cases.push(row)
    for (const enabled of [false, true]) {
      const parity = comparePixels(images[`fallback-${enabled}`], images[`compiled-${enabled}`])
      row.parity[enabled ? 'on' : 'off'] = parity
      assert.equal(
        parity.maxDelta,
        0,
        `${kind}: fallback/compiled pixels differ (${enabled ? 'on' : 'off'})`,
      )
    }
    for (const name of Object.keys(variants))
      row.effects[name] = verifyEffect(kind, images[`${name}-false`], images[`${name}-true`])
    row.passed = true
    console.log(`[svg-filters] ${kind}: exact pixel parity, visible and positioned effect`)
  }
  assert.equal(report.cases.length, 5)
  assert.deepEqual(errors, [])
  report.passed = true
} catch (error) {
  report.error = error.stack ?? String(error)
  throw error
} finally {
  // This CLI owns the esbuild service; no long-lived bundler needs it after
  // the two modules have been evaluated. Close it alongside the browser.
  stop()
  writeFileSync(path.join(output, 'evidence.json'), `${JSON.stringify(report, null, 2)}\n`)
  await browser?.close()
}
