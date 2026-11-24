// Shared browser, candidate cache, evaluation, and negative-control harness for
// `candidate-cascade-*.test.mjs`.
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { runInNewContext } from 'node:vm'
import { createCompiler, openCandidateCache } from '@hozo/compiler'
import { transformSync } from 'esbuild'
import { chromium } from 'playwright-core'
import { createElement, Fragment } from 'react'
import { compile } from 'tailwindcss'

export const executablePath = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((file) => file && existsSync(file))

if (process.env.CI) assert.ok(executablePath, 'CI must run candidate cascade browser regressions')

export async function launchCandidateBrowser() {
  if (!executablePath) return undefined
  return chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  })
}

export async function buildCascadeTailwindCss() {
  return (
    await compile(
      '@theme { --spacing: 0.25rem; --breakpoint-sm: 40rem; --breakpoint-md: 48rem; } @tailwind utilities;',
    )
  ).build([
    'grid',
    'grid-cols-1',
    'md:grid-cols-3',
    'flex',
    'flex-col',
    'sm:flex-row',
    'p-4',
    'md:p-8',
    'p-4!',
  ])
}

export function evaluate(code, globals = {}) {
  const module = { exports: {} }
  const js = transformSync(code, {
    loader: 'tsx',
    format: 'cjs',
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
  }).code
  runInNewContext(js, { module, h: createElement, Fragment, ...globals })
  return module.exports
}

export function compiledStyles(sheets, candidates) {
  return sheets
    .map((css) => `<style${css === candidates ? ' data-hozo-candidates' : ''}>${css}</style>`)
    .join('')
}

// The Web warns, at the attribute, for a secondary class list it carries
// whole (the opaque route); the residual warnings are the mixed routes'.
// Each carried list is an opaque route's whole call, not a mixed one.
const CARRIED_WHOLE = /^`\w+` can't be resolved at build time, so it's passed through/
export function residualWarnings(web, source) {
  const carried = web.diagnostics.filter(({ message }) => CARRIED_WHOLE.test(message))
  assert.ok(carried.length > 0, 'the opaque route warns on the Web too')
  for (const diagnostic of carried) {
    const attribute = source.slice(diagnostic.spanStart, diagnostic.spanEnd)
    assert.match(attribute, /^\w+=\{getClasses\(/)
    assert.doesNotMatch(attribute, /'mixed/)
  }
  return web.diagnostics.filter((diagnostic) => !carried.includes(diagnostic))
}

export function createCascadeContext(prefix = 'hozo-candidate-cascade-') {
  const directory = mkdtempSync(path.join(tmpdir(), prefix))
  const cache = openCandidateCache(path.join(directory, 'candidates.json'))
  cache.scanFile(
    'helpers.ts',
    "export const classes = 'grid-cols-1 flex-col flex-row p-3 p-4 p-8 sm:p-4 md:p-8'",
    1,
  )
  const candidateCss = cache.renderCss(undefined, [
    'flex-col',
    'flex-row',
    'grid-cols-1',
    'p-3',
    'p-4',
    'p-8',
    'sm:p-4',
    'md:p-8',
  ])
  const compiler = createCompiler()
  assert.match(candidateCss, /\.grid-cols-1 \{/)
  assert.match(candidateCss, /\.flex-col \{/)
  const candidateMutationChecks = []

  // Ordering names do not populate a candidate cache. Scan the authored source,
  // never generated JSX or compiler metadata, before asking it for rules.
  function scannedCandidateCss(name, source, names) {
    const candidates = openCandidateCache(path.join(directory, `${name}.json`))
    candidates.scanFile(`${name}.tsx`, source, 1)
    const css = candidates.renderCss(undefined, names)
    assert.ok(css.includes('.px-2'), `${name}: authored candidates must emit actual rules`)
    return css
  }

  // A passing comparison must depend on the candidate sheet, not on oracle
  // leakage or AOT rules alone. Restore it even when this negative control fails.
  async function assertCandidateStylesRequired(page, read, label) {
    const expected = await read()
    const toggle = (disabled) =>
      page.locator('style[data-hozo-candidates]').evaluate((e, disabled) => {
        e.sheet.disabled = disabled
      }, disabled)
    try {
      await toggle(true)
      assert.notDeepEqual(
        await read(),
        expected,
        `${label}: removing candidates must change pixels`,
      )
    } finally {
      await toggle(false)
    }
    assert.deepEqual(await read(), expected, `${label}: restoring candidates must restore pixels`)
    candidateMutationChecks.push(label)
  }

  function cleanup() {
    if (candidateMutationChecks.length)
      console.info(
        'candidate-sheet negative controls passed:',
        JSON.stringify(candidateMutationChecks),
      )
    // This exact mkdtemp result owns only this test's candidate snapshot.
    rmSync(directory, { recursive: true, force: true })
  }

  return {
    directory,
    cache,
    candidateCss,
    compiler,
    candidateMutationChecks,
    scannedCandidateCss,
    assertCandidateStylesRequired,
    cleanup,
  }
}
