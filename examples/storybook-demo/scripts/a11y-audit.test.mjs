import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { build } from 'esbuild'
import { chromium } from 'playwright-core'
import { auditPage, waitForSettledStory } from './a11y-audit.mjs'
import { createAuditReport, runAuditCatalogue, summarizeAudit } from './a11y-catalogue.mjs'

const executablePath = [
  process.env.CHROME_PATH,
  process.env.PUPPETEER_EXECUTABLE_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((file) => file && existsSync(file))
if (process.env.CI) assert.ok(executablePath, 'CI must run the browser regressions')
const axeSource = readFileSync(fileURLToPath(import.meta.resolve('axe-core/axe.min.js')), 'utf8')
let browser
let readerSource
before(async () => {
  if (executablePath) {
    browser = await chromium.launch({
      executablePath,
      headless: true,
      args: ['--no-sandbox', '--disable-gpu'],
    })
    const bundle = await build({
      stdin: {
        contents: [
          "import { virtual } from '@guidepup/virtual-screen-reader/browser.js'",
          "import { walk } from './utterance-walk.mjs'",
          "import { waitForSettledStory } from './a11y-audit.mjs'",
          'window.__hozoVirtual = virtual',
          'window.__hozoWalk = walk',
          'window.__hozoStoryReady = waitForSettledStory',
        ].join('\n'),
        resolveDir: fileURLToPath(new URL('.', import.meta.url)),
      },
      bundle: true,
      platform: 'browser',
      format: 'iife',
      write: false,
    })
    readerSource = bundle.outputFiles[0].text
  }
})

test('a delayed story is read after readiness, not approved as an empty finished traversal', {
  skip: !executablePath,
}, async () => {
  const page = await browser.newPage()
  try {
    await page.setContent('<div id="storybook-root"></div>')
    await page.addScriptTag({ content: readerSource })
    const empty = await page.evaluate(async () => {
      await __hozoVirtual.start({ container: document.getElementById('storybook-root'), window })
      const result = await __hozoWalk(__hozoVirtual, 400)
      await __hozoVirtual.stop()
      return result
    })
    assert.equal(empty.finished, true)
    assert.deepEqual(empty.log, [])
    const rendered = await page.evaluate(async () => {
      setTimeout(() => {
        document.getElementById('storybook-root').innerHTML = '<h2>Preferences</h2>'
      }, 650)
      await __hozoStoryReady(2500)
      await __hozoVirtual.start({ container: document.getElementById('storybook-root'), window })
      const result = await __hozoWalk(__hozoVirtual, 400)
      await __hozoVirtual.stop()
      return result
    })
    assert.equal(rendered.finished, true)
    assert.ok(rendered.log.includes('heading, Preferences, level 2'))
  } finally {
    await page.close()
  }
})
after(async () => {
  await browser?.close()
})

const content = `<style>
body { background: #f8fafc }
#panel { background: #fff; color: #475569; padding: 24px }
@media (prefers-color-scheme: dark) { #panel { background: #0f172a; color: #cbd5e1 } }
</style><div id="storybook-root"><div id="panel"><p>Shipping takes two days.</p></div></div>`

for (const scheme of ['light', 'dark']) {
  test(`a ${scheme} entrance is audited at its final colours, without restyling it`, {
    skip: !executablePath,
  }, async () => {
    const page = await browser.newPage({ colorScheme: scheme })
    try {
      await page.setContent(content)
      // Hold a finite entrance mid-fade: the same blended-colour failure the
      // virtual-time driver reported, made deterministic rather than retried.
      await page.evaluate(() => {
        window.entrance = document
          .getElementById('panel')
          .animate([{ opacity: 0.2 }, { opacity: 1 }], { duration: 800, fill: 'both' })
        entrance.pause()
        entrance.currentTime = 100
      })
      await page.addScriptTag({ content: `${axeSource}\nwindow.__hozoAuditAxe = window.axe;` })
      const midFade = await page.evaluate(
        async () =>
          (await __hozoAuditAxe.run(document.getElementById('storybook-root'))).violations,
      )
      assert.ok(midFade.some((violation) => violation.id === 'color-contrast'))
      await page.evaluate(() => entrance.play())
      const result = await auditPage(page, axeSource)
      assert.equal(result.dark, scheme === 'dark')
      assert.deepEqual(result.found, [])
      assert.equal(
        await page.locator('#panel').evaluate((element) => getComputedStyle(element).opacity),
        '1',
      )
      assert.equal(await page.evaluate(() => entrance.effect.getTiming().duration), 800)
    } finally {
      await page.close()
    }
  })
}

test('a persistent contrast defect still fails after readiness', {
  skip: !executablePath,
}, async () => {
  const page = await browser.newPage({ colorScheme: 'light' })
  try {
    await page.setContent(`${content}<style>#panel { color: #ddd }</style>`)
    const result = await auditPage(page, axeSource)
    const failure = result.found.find((violation) => violation.rule === 'color-contrast')
    assert.ok(failure)
    assert.match(failure.details, /insufficient color contrast/)
  } finally {
    await page.close()
  }
})

test('a real axe defect still fails the serial catalogue in both colour schemes', {
  skip: !executablePath,
}, async () => {
  const report = createAuditReport(['bad-contrast'])
  await runAuditCatalogue(report, async (scheme) => {
    const page = await browser.newPage({ colorScheme: scheme })
    return {
      close: () => page.close(),
      async audit(_id, onStage) {
        await page.setContent(
          `${content}<style>#panel { background: #fff !important; color: #ddd !important }</style>`,
        )
        return auditPage(page, axeSource, 10000, onStage)
      },
    }
  })
  const verdict = summarizeAudit(report)
  assert.equal(verdict.passed, false)
  assert.equal(verdict.complete, true)
  assert.equal(verdict.audited, 2)
  assert.equal(verdict.errors.length, 0)
  assert.equal(verdict.notRun.length, 0)
  assert.deepEqual(
    new Set(
      verdict.fresh.filter((entry) => entry.rule === 'color-contrast').map((entry) => entry.scheme),
    ),
    new Set(['light', 'dark']),
  )
})

test('a browser batch timeout cancels a stuck preparation without inventing axe violations', {
  skip: !executablePath,
}, async () => {
  const page = await browser.newPage({ colorScheme: 'light' })
  try {
    await page.setContent(content)
    await page.evaluate(() => {
      document
        .getElementById('panel')
        .animate([{ opacity: 0 }, { opacity: 1 }], { duration: 800 })
        .pause()
    })
    const report = createAuditReport(['stuck', 'unvisited'], {
      batchSize: 2,
      batchTimeoutMs: 150,
      catalogueTimeoutMs: 5000,
    })
    let dispatched = 0
    await runAuditCatalogue(report, async () => ({
      close: () => page.close(),
      audit: async (_id, onStage) => {
        dispatched++
        return auditPage(page, axeSource, 10000, onStage)
      },
    }))
    const verdict = summarizeAudit(report)
    assert.equal(verdict.passed, false)
    assert.equal(verdict.audited, 0)
    assert.equal(verdict.violations, 0)
    assert.equal(verdict.errors[0].stage, 'preparation')
    assert.equal(verdict.notRun.length, 3)
    assert.equal(dispatched, 1)
    assert.equal(report.errors[0].kind, 'batch-timeout')
  } finally {
    await page.close()
  }
})

test('the actual CLI persists and distinguishes genuine findings from execution errors', {
  skip: !executablePath,
  timeout: 30000,
}, async (context) => {
  const directory = mkdtempSync(path.join(tmpdir(), 'hozo-a11y-cli-'))
  // This exact mkdtemp result contains only this fixture and its audit evidence.
  context.after(() => rmSync(directory, { recursive: true, force: true }))
  writeFileSync(
    path.join(directory, 'iframe.html'),
    `<!doctype html>
    <style>body {background: white; color: black; font: 16px Arial} .bad {color: #ddd}</style>
    <div id="storybook-root"></div><script>
      const id = new URL(location.href).searchParams.get('id')
      document.getElementById('storybook-root').innerHTML = '<p class="' + (id === 'contrast' ? 'bad' : '') + '">Audit fixture</p>'
      if (id === 'runtime-error') throw new Error('deliberate fixture render error')
    </script>`,
  )
  const run = async (ids) => {
    writeFileSync(
      path.join(directory, 'index.json'),
      JSON.stringify({ entries: Object.fromEntries(ids.map((id) => [id, { id, type: 'story' }])) }),
    )
    let failure
    let output
    try {
      output = await promisify(execFile)(
        process.execPath,
        [fileURLToPath(new URL('./check-a11y.mjs', import.meta.url)), directory],
        {
          env: { ...process.env, CHROME_PATH: executablePath },
          timeout: 20000,
        },
      )
    } catch (error) {
      failure = error
      output = error
    }
    return {
      failure,
      output,
      report: JSON.parse(readFileSync(path.join(directory, '_a11y-result.json'), 'utf8')),
    }
  }
  const clean = await run(['clean'])
  assert.equal(clean.failure, undefined)
  assert.equal(clean.report.verdict.passed, true)
  assert.equal(clean.report.verdict.audited, 2)
  assert.match(clean.output.stdout, /2\/2 story\/scheme cases audited/)
  const bad = await run(['contrast', 'runtime-error'])
  assert.equal(bad.failure.code, 1)
  assert.equal(bad.report.verdict.passed, false)
  assert.equal(bad.report.verdict.audited, 2)
  assert.equal(bad.report.verdict.errors.length, 2)
  assert.equal(bad.report.verdict.notRun.length, 0)
  assert.ok(bad.report.verdict.fresh.some((finding) => finding.rule === 'color-contrast'))
  assert.ok(bad.report.verdict.fresh.every((finding) => finding.impact !== 'error'))
  assert.match(bad.output.stderr, /execution error: runtime-error/)
  assert.match(bad.output.stderr, /actual axe violation/)
})

test('a paused finite entrance fails within the original bound', {
  skip: !executablePath,
}, async () => {
  const page = await browser.newPage()
  try {
    await page.setContent(content)
    await page.evaluate(() => {
      const animation = document
        .getElementById('panel')
        .animate([{ opacity: 0 }, { opacity: 1 }], { duration: 800 })
      animation.pause()
    })
    await assert.rejects(page.evaluate(waitForSettledStory, 100), /story did not settle/)
  } finally {
    await page.close()
  }
})

test('a missing story cannot pass as an empty accessibility tree', {
  skip: !executablePath,
}, async () => {
  const page = await browser.newPage()
  try {
    await page.setContent('<div id="storybook-root"></div>')
    await assert.rejects(page.evaluate(waitForSettledStory, 100), /story did not settle/)
  } finally {
    await page.close()
  }
})

test('the hidden Storybook error template is not mistaken for a render failure', {
  skip: !executablePath,
}, async () => {
  const page = await browser.newPage()
  try {
    await page.setContent(
      '<div class="sb-errordisplay" hidden></div><div id="storybook-root"></div>',
    )
    await page.evaluate(() => {
      setTimeout(() => {
        document.getElementById('storybook-root').innerHTML = '<p>Rendered</p>'
      }, 50)
    })
    await page.evaluate(waitForSettledStory, 1000)
  } finally {
    await page.close()
  }
})

test('an active Storybook error is reported rather than audited as an empty tree', {
  skip: !executablePath,
}, async () => {
  const page = await browser.newPage()
  try {
    await page.setContent(
      '<body class="sb-show-errordisplay"><div class="sb-errordisplay">Render failed</div><div id="storybook-root"></div></body>',
    )
    await assert.rejects(page.evaluate(waitForSettledStory, 1000), /Storybook failed to render/)
  } finally {
    await page.close()
  }
})

test('a decorative infinite spinner remains running without blocking the audit', {
  skip: !executablePath,
}, async () => {
  const page = await browser.newPage()
  try {
    await page.setContent(`${content}<div aria-hidden="true" id="spinner"></div>`)
    await page.evaluate(() => {
      window.spinnerAnimation = document
        .getElementById('spinner')
        .animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], {
          duration: 800,
          iterations: Infinity,
        })
    })
    await page.evaluate(waitForSettledStory, 1000)
    assert.equal(await page.evaluate(() => spinnerAnimation.playState), 'running')
  } finally {
    await page.close()
  }
})
