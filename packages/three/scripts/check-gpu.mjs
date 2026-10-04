// Real-browser conformance for the three renderer families. This is a main,
// weekly, and manual report rather than a pull-request gate: GPU availability
// and driver selection belong in the result instead of becoming CI flake.

import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const here = path.dirname(fileURLToPath(import.meta.url))
const candidates = [
  process.env.CHROME_PATH,
  process.env.PUPPETEER_EXECUTABLE_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].filter(Boolean)
const browser = candidates.find((candidate) => existsSync(candidate))
if (!browser) {
  if (process.env.CI) throw new Error('GPU conformance requires Chrome or Chromium in CI')
  console.log('three GPU conformance: no browser found -- skipped')
  process.exit(0)
}

const outputFlag = process.argv.indexOf('--output')
const output = path.resolve(
  outputFlag >= 0 ? process.argv[outputFlag + 1] : path.join('artifacts', 'three-gpu'),
)
const dist = mkdtempSync(path.join(tmpdir(), 'hozo-three-gpu-'))
const { build } = await import('esbuild')

try {
  await build({
    entryPoints: [path.join(here, 'gpu-conformance-probe.tsx')],
    bundle: true,
    format: 'esm',
    jsx: 'automatic',
    outfile: path.join(dist, 'probe.js'),
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'silent',
  })
  copyFileSync(
    path.join(here, '..', 'fixtures', 'minimal-pbr.gltf'),
    path.join(dist, 'minimal-pbr.gltf'),
  )
  writeFileSync(
    path.join(dist, 'index.html'),
    '<!doctype html><meta charset="utf-8"><div id="app"></div>' +
      '<script type="module" src="/probe.js"></script>',
  )
  const server = createServer((request, response) => {
    const name = (request.url ?? '/').split('?')[0]
    const file = path.join(dist, name === '/' ? 'index.html' : name.replace(/^\//, ''))
    if (!file.startsWith(dist) || !existsSync(file)) {
      response.writeHead(404).end('not found')
      return
    }
    response.writeHead(200, {
      'content-type': file.endsWith('.js')
        ? 'text/javascript; charset=utf-8'
        : 'text/html; charset=utf-8',
    })
    response.end(readFileSync(file))
  })
  const port = await new Promise((resolve) =>
    server.listen(0, () => resolve(server.address().port)),
  )
  const modes = process.argv.includes('--portable-only')
    ? ['portable-textures']
    : ['portable-textures', 'classic-webgl', 'modern-auto', 'modern-force-webgl2']
  const results = []
  try {
    for (const mode of modes) {
      try {
        const result = await run(mode, port)
        results.push(
          mode === 'modern-auto' && result.error ? { ...result, backend: 'unavailable' } : result,
        )
      } catch (error) {
        if (mode !== 'modern-auto') throw error
        results.push({
          activated: false,
          backend: 'unavailable',
          error: error instanceof Error ? error.message : String(error),
          mode,
          renderCalls: 0,
          semanticControl: false,
        })
      }
    }
  } finally {
    server.close()
  }

  const report = {
    browser: browserIdentity(),
    generatedAt: new Date().toISOString(),
    nativeWebGPUObserved: results.some(({ backend }) => backend === 'webgpu'),
    results,
  }
  mkdirSync(output, { recursive: true })
  writeFileSync(path.join(output, 'conformance.json'), `${JSON.stringify(report, null, 2)}\n`)
  writeFileSync(path.join(output, 'conformance.md'), markdown(report))
  console.log(markdown(report))

  const invalid = results.filter((result) => {
    if (result.mode === 'portable-textures') {
      return (
        result.error ||
        result.backend !== 'canvas2d' ||
        result.portableTextures?.length !== 36 ||
        result.portableTextures.some(({ passed, samples }) => !passed || samples < 1)
      )
    }
    if (result.mode === 'modern-auto' && result.backend === 'unavailable') return false
    return (
      result.error ||
      result.renderCalls < 1 ||
      !result.semanticControl ||
      !result.activated ||
      result.sceneCorpus?.some(({ status }) => status !== 'useful') ||
      (result.mode === 'classic-webgl' && result.backend !== 'classic-webgl') ||
      (result.mode === 'modern-force-webgl2' && result.backend !== 'modern-webgl2')
    )
  })
  if (invalid.length > 0) process.exitCode = 1
} finally {
  const removalOptions = { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }
  rmSync(dist, removalOptions)
}

async function run(mode, port) {
  // A real animation loop needs real browser frames. --virtual-time-budget
  // can exhaust timers while requestAnimationFrame hardly advances.
  const instance = await chromium.launch({
    executablePath: browser,
    headless: true,
    args: [
      '--no-sandbox',
      '--enable-unsafe-webgpu',
      '--ignore-gpu-blocklist',
      ...(mode === 'modern-auto' ? [] : ['--use-angle=swiftshader']),
    ],
  })
  try {
    const page = await instance.newPage()
    await page.goto(`http://127.0.0.1:${port}/?mode=${mode}`)
    const result = await page.waitForFunction(() => document.body.dataset.hozoResult, undefined, {
      timeout: 15_000,
    })
    return JSON.parse(Buffer.from(await result.jsonValue(), 'base64').toString('utf8'))
  } finally {
    await instance.close()
  }
}

function browserIdentity() {
  const version = spawnSync(browser, ['--version'], { encoding: 'utf8' }).stdout.trim()
  return /\d+\./.test(version) ? version : path.basename(browser)
}

function markdown(report) {
  const lines = [
    '# Three.js GPU conformance',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    `Browser: ${report.browser}`,
    '',
    '| Requested family | Actual backend | Draw calls | Semantic control | Activation | Error |',
    '| --- | --- | ---: | --- | --- | --- |',
  ]
  for (const result of report.results) {
    const error = result.error?.replaceAll('|', '\\|').replaceAll('\n', '<br>') ?? ''
    lines.push(
      `| ${result.mode} | ${result.backend} | ${result.renderCalls} | ${result.semanticControl ? 'yes' : 'no'} | ${result.activated ? 'yes' : 'no'} | ${error} |`,
    )
  }
  for (const result of report.results.filter(({ sceneCorpus }) => sceneCorpus)) {
    lines.push(
      '',
      `## ${result.mode} real-scene corpus (${result.backend})`,
      '',
      '| Fixture | Status | Draw calls | Texture count delta | Image decoder | Animation frames / angle | Semantic controls | Activation | Error |',
      '| --- | --- | ---: | ---: | --- | --- | ---: | --- | --- |',
    )
    for (const fixture of result.sceneCorpus) {
      const error = fixture.error?.replaceAll('|', '\\|').replaceAll('\n', '<br>') ?? ''
      lines.push(
        `| ${fixture.id} | ${fixture.status} | ${fixture.renderCalls} | ${fixture.textureCountDelta} | ${fixture.imageDecoding ?? '-'} | ${fixture.animationFrames === undefined ? '-' : `${fixture.animationFrames} / ${fixture.animationAngle.toFixed(3)} rad`} | ${fixture.semanticControls} | ${fixture.activated ? 'yes' : 'no'} | ${error} |`,
      )
    }
  }
  for (const result of report.results.filter(({ portableTextures }) => portableTextures)) {
    lines.push(
      '',
      '## Portable texture pixels (Canvas 2D)',
      '',
      '| Wrapping | Passed | Pixel samples | Maximum channel error |',
      '| --- | --- | ---: | ---: |',
    )
    for (const texture of result.portableTextures) {
      lines.push(
        `| ${texture.name} | ${texture.passed ? 'yes' : 'no'} | ${texture.samples} | ${texture.maxChannelError} |`,
      )
    }
  }
  lines.push(
    '',
    `Native WebGPU backend observed: ${report.nativeWebGPUObserved ? 'yes' : 'no'}`,
    '',
  )
  return `${lines.join('\n')}\n`
}
